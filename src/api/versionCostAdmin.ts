import { z } from 'zod';
import type { RequestHandler } from 'express';
import * as versionCost from '../db/queries/versionCost.js';
import { summarizeVersions } from '../analytics/versionCost.js';

const QuerySchema = z.object({
  agentInstanceId: z.string().uuid().optional(),
  clients: z.enum(['all', 'live', 'test']).default('all'),
});

/**
 * GET /api/admin/version-cost?agentInstanceId=&clients=all|live|test — every
 * app version that made an LLM call, newest first, with its totals, its cost
 * per unit of work and the change against the previous version (openspec
 * `cost-per-version`), plus the instances the filter may pick. Admin only
 * (requireAdmin); the accountant's session has no route to these figures.
 */
export const adminGetVersionCost: RequestHandler = async (req, res) => {
  const query = QuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: 'Invalid filters.' });
    return;
  }
  const [groups, instances] = await Promise.all([
    versionCost.listByVersion({ agentInstanceId: query.data.agentInstanceId, clientKind: query.data.clients }),
    versionCost.listInstancesWithCalls(),
  ]);
  const versions = summarizeVersions(
    groups.map((g) => ({
      appVersion: g.app_version,
      purpose: g.purpose,
      calls: g.calls,
      failed: g.failed,
      cost: g.cost,
      unpriced: g.unpriced,
      inputTokens: g.input_tokens,
      outputTokens: g.output_tokens,
      thinkingTokens: g.thinking_tokens,
      cachedTokens: g.cached_tokens,
      cycles: g.cycles,
      files: g.files,
      firstAt: g.first_at,
      lastAt: g.last_at,
    })),
  );
  res.json({
    versions,
    instances: instances.map((i) => ({ id: i.id, name: i.name, accountantEmail: i.accountant_email })),
  });
};
