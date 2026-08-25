import * as auditEvents from '../db/queries/auditEvents.js';
import type { AuditActorType, AuditSeverity } from '../db/queries/auditEvents.js';
import { raiseAlert } from '../alerts/raiseAlert.js';
import { logger } from '../util/logger.js';

/**
 * Every action the platform audits. Dot-namespaced; extend this union when
 * instrumenting a new action site. The `admin.*` template covers the mutating
 * admin API, whose action names derive from the route (see requireAdmin).
 */
export type AuditAction =
  | 'email.client_sent'
  | 'email.document_sent'
  | 'email.accountant_sent'
  | 'wa.text_sent'
  | 'wa.template_sent'
  | 'wa.media_sent'
  | 'tax_fetch.login_started'
  | 'tax_fetch.otp_submitted'
  | 'tax_fetch.document_delivered'
  | 'tax_fetch.failed'
  | 'document.collected'
  | 'document.claimed'
  | 'document.resolved'
  | 'document.instances_added'
  | 'document.superseded'
  | 'document.verified'
  | 'document.verification_failed'
  | 'document.status_changed'
  | 'client.attestation_requested'
  | 'client.attestation_confirmed'
  | 'goal.completed'
  | 'debt.no_debt'
  | 'debt.paid'
  | 'debt.paid_claimed'
  | 'debt.confirmed_paid'
  | 'injection.cycle_suppressed'
  | 'client.auto_enrolled'
  | 'client.kickoff_triggered'
  | 'agent.auto_provisioned'
  | 'wa_business.connected'
  | 'wa_business.disconnected'
  | 'review.message_pending'
  | 'review.message_held'
  | 'client.llm_variant_assigned'
  | `admin.${string}`;

export interface AuditEvent {
  actorType: AuditActorType;
  action: AuditAction;
  actorUserId?: string | null;
  agentInstanceId?: string | null;
  clientId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  severity?: AuditSeverity;
  suspectedInjection?: boolean;
  /** Human-readable context (client name, subject, counts). FKs SET NULL on delete — labels here keep the row meaningful. */
  detail?: Record<string, unknown>;
}

/**
 * Appends one row to the audit trail. Fire-and-forget by design: recording
 * must never fail or slow the action it describes, so this returns void and
 * logs (rather than throws) on failure. Critical events additionally raise an
 * event-time admin alert — that's the "minutes, not days" detection path.
 *
 * Deliberately NOT gated on the kill switch: recording and alerting must keep
 * working during an incident — they are how the incident is seen.
 */
export function recordAudit(e: AuditEvent): void {
  const severity = e.severity ?? 'info';
  void (async () => {
    await auditEvents.insert({
      actorType: e.actorType,
      actorUserId: e.actorUserId ?? null,
      agentInstanceId: e.agentInstanceId ?? null,
      clientId: e.clientId ?? null,
      action: e.action,
      targetType: e.targetType ?? null,
      targetId: e.targetId ?? null,
      severity,
      suspectedInjection: e.suspectedInjection ?? false,
      detail: e.detail ?? {},
    });
    if (severity === 'critical') {
      await raiseAlert({
        rule: `critical_event:${e.action}`,
        scopeKey: e.agentInstanceId ?? e.actorUserId ?? '',
        severity: 'critical',
        title: criticalTitle(e.action),
        detail: { action: e.action, clientId: e.clientId ?? null, ...e.detail },
      });
    }
  })().catch((err) => logger.error('audit record failed', err, { action: e.action }));
}

/** Alert title (shown in the admin email + alerts list) for a critical audit event. */
function criticalTitle(action: string): string {
  switch (action) {
    case 'injection.cycle_suppressed':
      return 'חשד להזרקת פרומפט — מחזור תכנון דוכא';
    case 'admin.kill_switch_set':
      return 'מתג החירום הכלל-מערכתי שונה';
    case 'admin.whitelist_added':
      return 'נוספה גישה לחשבון חדש (whitelist)';
    default:
      return `אירוע קריטי: ${action}`;
  }
}

export { redactForAudit } from './redact.js';
