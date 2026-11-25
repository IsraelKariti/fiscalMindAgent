import { z } from 'zod';
import type { RequestHandler } from 'express';
import * as llmFallbacks from '../db/queries/llmFallbacks.js';
import { summarizeFallbacks } from '../analytics/llmFallbacks.js';

const QuerySchema = z.object({
  days: z.enum(['7', '30', '90']).optional(),
});

/**
 * GET /api/admin/llm-fallbacks?days=7|30|90 (absent = every call) — per
 * model, the share of the calls aimed at it that were handed to the stage's
 * backup model in the period (openspec `fallbacks-dashboard`), with the
 * dates the "recorded since" note needs. Admin only (requireAdmin); the
 * accountant's session has no route to these figures.
 */
export const adminGetLlmFallbacks: RequestHandler = async (req, res) => {
  const query = QuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: 'Invalid period.' });
    return;
  }
  const days = query.data.days ? Number(query.data.days) : null;
  const since = days ? new Date(Date.now() - days * 24 * 60 * 60 * 1000) : null;
  const [groups, meta] = await Promise.all([llmFallbacks.listGroups(since), llmFallbacks.periodMeta(since)]);
  const summary = summarizeFallbacks(
    groups.map((g) => ({
      model: g.model,
      provider: g.provider,
      purpose: g.purpose,
      fallbackFromModel: g.fallback_from_model,
      fallbackFromProvider: g.fallback_from_provider,
      fallbackReason: g.fallback_reason,
      status: g.status,
      calls: g.calls,
    })),
  );
  res.json({
    days,
    since: since ? since.toISOString() : null,
    firstMarkedAt: meta.first_marked_at ? meta.first_marked_at.toISOString() : null,
    oldestInPeriod: meta.oldest_in_period ? meta.oldest_in_period.toISOString() : null,
    ...summary,
  });
};
