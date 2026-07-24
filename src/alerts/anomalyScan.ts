import * as auditEvents from '../db/queries/auditEvents.js';
import * as llmUsage from '../db/queries/llmUsage.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';
import { raiseAlert } from './raiseAlert.js';
import { evaluateOffHours, evaluateTokenSpikes, evaluateVolumeSpikes } from './anomalyRules.js';

const HOUR_MS = 3_600_000;
const BASELINE_DAYS = 7;

/** Outbound messages to clients — the "how loud is this instance" counter. */
const SEND_ACTIONS = ['email.client_sent', 'wa.text_sent', 'wa.template_sent', 'wa.media_sent'];

/** "YYYY-MM-DD" on the accountants' wall clock, matching llm_usage_daily's bucketing. */
function dayInAccountantTz(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.ACCOUNTANT_TIMEZONE }).format(at);
}

/**
 * The periodic (15-minute) anomaly sweep over the audit trail and the LLM
 * usage counters. Each rule that fires becomes an anomaly_alerts row + one
 * admin email (raiseAlert throttles repeats). Rules are deliberately
 * flag-and-notify only — per the platform's authority-reduction doctrine,
 * detection never auto-acts; stopping things is the admin's kill switch.
 *
 * Deliberately NOT gated on the kill switch: detection must keep running
 * during an incident — it is the layer that sees the incident.
 */
export async function runAnomalyScan(): Promise<void> {
  const now = new Date();
  const hourAgo = new Date(now.getTime() - HOUR_MS);
  const baselineStart = new Date(hourAgo.getTime() - BASELINE_DAYS * 24 * HOUR_MS);
  const baselineHours = BASELINE_DAYS * 24;

  // 1. Outbound-send volume spike per agent instance.
  const [sendCurrent, sendBaseline] = await Promise.all([
    auditEvents.countByInstanceBetween(SEND_ACTIONS, hourAgo, now),
    auditEvents.countByInstanceBetween(SEND_ACTIONS, baselineStart, hourAgo),
  ]);
  const toKeyed = (rows: auditEvents.InstanceActionCountRow[]) =>
    rows.map((r) => ({ key: r.agent_instance_id ?? '', count: r.count }));
  for (const spike of evaluateVolumeSpikes(toKeyed(sendCurrent), toKeyed(sendBaseline), baselineHours, {
    minThreshold: 20,
    multiplier: 4,
  })) {
    await raiseAlert({
      rule: 'send_volume_spike',
      scopeKey: spike.key,
      severity: 'warning',
      title: `קצב שליחה חריג — ${spike.current} הודעות ללקוחות בשעה האחרונה`,
      detail: { agentInstanceId: spike.key || null, ...spike },
    });
  }

  // 2. Auto-enrollment spike per agent instance (a runaway import or an
  //    inbound-WhatsApp flood creating clients).
  const [enrollCurrent, enrollBaseline] = await Promise.all([
    auditEvents.countByInstanceBetween(['client.auto_enrolled'], hourAgo, now),
    auditEvents.countByInstanceBetween(['client.auto_enrolled'], baselineStart, hourAgo),
  ]);
  for (const spike of evaluateVolumeSpikes(toKeyed(enrollCurrent), toKeyed(enrollBaseline), baselineHours, {
    minThreshold: 25,
    multiplier: 4,
  })) {
    await raiseAlert({
      rule: 'enrollment_spike',
      scopeKey: spike.key,
      severity: 'warning',
      title: `רישום לקוחות חריג — ${spike.current} לקוחות חדשים בשעה האחרונה`,
      detail: { agentInstanceId: spike.key || null, ...spike },
    });
  }

  // 3. Repeated tax-fetch failures platform-wide (broken automation, a changed
  //    tax-authority site, or someone probing the OTP flow).
  const taxFailures = await auditEvents.countActionSince('tax_fetch.failed', hourAgo);
  if (taxFailures >= 3) {
    await raiseAlert({
      rule: 'tax_fetch_failures',
      severity: 'critical',
      title: `כשלונות חוזרים במשיכה מרשות המסים — ${taxFailures} בשעה האחרונה`,
      detail: { failures: taxFailures },
    });
  }

  // 4. Tax-authority logins at odd local hours — each one fires a real OTP SMS,
  //    and the normal conversational flow doesn't produce 3am logins.
  const logins = await auditEvents.listActionSince('tax_fetch.login_started', hourAgo);
  const offHours = evaluateOffHours(
    logins.map((l) => ({ occurredAt: l.occurred_at, key: l.agent_instance_id })),
    env.ACCOUNTANT_TIMEZONE,
  );
  for (const hit of offHours) {
    await raiseAlert({
      rule: 'off_hours_tax_login',
      scopeKey: hit.key ?? '',
      severity: 'warning',
      title: `התחברות לרשות המסים בשעה חריגה (${hit.localHour}:00)`,
      detail: { agentInstanceId: hit.key, occurredAt: hit.occurredAt.toISOString(), localHour: hit.localHour },
    });
  }

  // 5. Per-accountant LLM token spike vs their prior week — runaway loops or
  //    someone driving the agents far beyond their normal usage.
  const today = dayInAccountantTz(now);
  const sinceDay = dayInAccountantTz(new Date(now.getTime() - BASELINE_DAYS * 24 * HOUR_MS));
  const usageRows = await llmUsage.listDaily(sinceDay);
  const perUser = new Map<string, { today: number; priorTotal: number; priorDaySet: Set<string> }>();
  for (const row of usageRows) {
    const total = row.input_tokens + row.output_tokens + row.thinking_tokens;
    const entry = perUser.get(row.user_id) ?? { today: 0, priorTotal: 0, priorDaySet: new Set<string>() };
    if (row.day === today) entry.today += total;
    else {
      entry.priorTotal += total;
      entry.priorDaySet.add(row.day);
    }
    perUser.set(row.user_id, entry);
  }
  const tokenSpikes = evaluateTokenSpikes(
    [...perUser.entries()].map(([userId, u]) => ({
      key: userId,
      today: u.today,
      priorTotal: u.priorTotal,
      priorDays: u.priorDaySet.size,
    })),
    { minTokens: 2_000_000, multiplier: 4 },
  );
  for (const spike of tokenSpikes) {
    await raiseAlert({
      rule: 'llm_token_spike',
      scopeKey: spike.key,
      severity: 'warning',
      title: `זינוק בצריכת טוקנים — ${Math.round(spike.today / 1000)}K טוקנים היום`,
      detail: { userId: spike.key, ...spike },
    });
  }

  logger.info('anomaly scan finished', {
    sendSpikes: sendCurrent.length,
    taxFailures,
    offHoursLogins: offHours.length,
    tokenUsersChecked: perUser.size,
  });
}
