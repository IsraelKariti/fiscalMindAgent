import { z } from 'zod';
import type { RequestHandler } from 'express';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as draftOutcomes from '../db/queries/draftOutcomes.js';
import { summarize, type DraftOutcome } from '../analytics/discardedMessages.js';
import { env } from '../config/env.js';
import { getMessageTiming } from '../orchestration/timingSettings.js';
import { zonedTimeToUtc } from '../util/time.js';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const QuerySchema = z.object({
  from: z.string().regex(DAY_RE).optional(),
  to: z.string().regex(DAY_RE).optional(),
});

/** The instant's calendar day in the accountant timezone, as YYYY-MM-DD. */
function dayOf(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: env.ACCOUNTANT_TIMEZONE }).format(at);
}

function nextDay(day: string): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/**
 * GET /api/admin/agents/:agentInstanceId/message-analytics?from=YYYY-MM-DD&to=YYYY-MM-DD
 * — what became of the instance's outbound drafts in the range (openspec
 * `discarded-message-analytics`), for the admin-only analytics tab of the
 * Settings view. Days are accountant-timezone calendar days, inclusive; the
 * default range is from the first draft to today. Admin only (requireAdmin).
 */
export const adminGetMessageAnalytics: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.agentInstanceId);
  const instance = id.success ? await agentInstances.getById(id.data) : null;
  if (!instance) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  const query = QuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: 'from/to must be YYYY-MM-DD.' });
    return;
  }
  const firstAt = await draftOutcomes.firstDraftAt(instance.id);
  const today = dayOf(new Date());
  const firstDay = firstAt ? dayOf(firstAt) : today;
  const from = query.data.from ?? firstDay;
  const to = query.data.to ?? today;
  if (from > to) {
    res.status(400).json({ error: 'from must not be after to.' });
    return;
  }
  const tz = env.ACCOUNTANT_TIMEZONE;
  const rows = await draftOutcomes.listForInstance(
    instance.id,
    zonedTimeToUtc(`${from} 00:00`, tz),
    zonedTimeToUtc(`${nextDay(to)} 00:00`, tz),
  );
  const drafts: DraftOutcome[] = rows.map((r) => ({
    id: r.id,
    clientId: r.client_id,
    clientName: r.client_name,
    clientDeleted: r.client_deleted,
    sent: r.status === 'sent',
    createdAt: r.created_at,
    planTrigger: r.plan_trigger,
    scheduledFor: r.scheduled_for,
    discardedAt: r.discarded_at,
    discardReason: r.discard_reason,
    cost: r.cost,
    lastInboundAt: r.last_inbound_at,
  }));
  res.json({
    from,
    to,
    firstDraftDay: firstAt ? firstDay : null,
    timeZone: tz,
    currentQuietSeconds: (await getMessageTiming()).quietSeconds,
    ...summarize(drafts, tz),
  });
};
