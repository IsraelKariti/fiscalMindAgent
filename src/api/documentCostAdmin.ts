import { z } from 'zod';
import type { RequestHandler } from 'express';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as documentCost from '../db/queries/documentCost.js';
import { summarizeDocumentCost } from '../analytics/documentCost.js';

const QuerySchema = z.object({
  clients: z.enum(['all', 'live', 'test']).default('live'),
  completed: z.enum(['0', '1']).default('0'),
});

/**
 * GET /api/admin/agents/:agentInstanceId/document-cost?clients=live|test|all&completed=0|1
 * — what the instance's LLM spend bought in settled checklist items, per
 * client and pooled (openspec `document-cost-analytics`), for the admin-only
 * documents tab of the Settings view. Lifetime figures, no date range.
 * Admin only (requireAdmin); the accountant's session has no route to them.
 */
export const adminGetDocumentCost: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.agentInstanceId);
  const instance = id.success ? await agentInstances.getById(id.data) : null;
  if (!instance) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  const query = QuerySchema.safeParse(req.query);
  if (!query.success) {
    res.status(400).json({ error: 'clients must be live, test or all; completed must be 0 or 1.' });
    return;
  }
  const rows = await documentCost.listForInstance(instance.id, query.data.clients);
  res.json({
    agentInstanceId: instance.id,
    clientKind: query.data.clients,
    completedOnly: query.data.completed === '1',
    ...summarizeDocumentCost(rows, { completedOnly: query.data.completed === '1' }),
  });
};
