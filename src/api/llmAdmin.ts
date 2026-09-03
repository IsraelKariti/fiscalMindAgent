import { z } from 'zod';
import type { RequestHandler } from 'express';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as clients from '../db/queries/clients.js';
import * as emails from '../db/queries/emails.js';
import * as llmCalls from '../db/queries/llmCalls.js';
import * as users from '../db/queries/users.js';
import type { ClientRow, EmailRow } from '../db/types.js';

/**
 * Admin-only LLM observability surface (049): the per-call log browser (the
 * exact input each call sent) and the conversation viewer. Everything mounts
 * behind requireAdmin; none of it is ever exposed to the accountant-facing
 * workspace.
 */

function toAdminClient(c: ClientRow) {
  return {
    id: c.id,
    name: c.name,
    emailAddress: c.email_address,
    waPhone: c.wa_phone,
    goalStatus: c.goal_status,
    paused: c.paused,
    adminPaused: c.admin_paused,
    createdAt: c.created_at,
  };
}

function toAdminMessage(m: EmailRow) {
  return {
    id: m.id,
    direction: m.direction,
    status: m.status,
    channel: m.channel,
    subject: m.subject,
    body: m.body,
    isTemplate: Boolean(m.wa_content_sid),
    reasoning: m.reasoning,
    reviewStatus: m.review_status,
    heldAt: m.held_at,
    sentAt: m.sent_at,
    createdAt: m.created_at,
  };
}

/** GET /api/admin/agents/:agentInstanceId/clients — the instance's clients with their last activity. */
export const adminListInstanceClients: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.agentInstanceId);
  const instance = id.success ? await agentInstances.getById(id.data) : null;
  if (!instance) {
    res.status(404).json({ error: 'Agent not found.' });
    return;
  }
  const list = await clients.listForInstance(instance.id);
  const lastAt = await emails.lastMessageAtByClient(list.map((c) => c.id));
  res.json({
    clients: list.map((c) => ({ ...toAdminClient(c), lastMessageAt: lastAt.get(c.id) ?? null })),
  });
};

/**
 * GET /api/admin/clients/:clientId/conversation — the full thread the agent is
 * having with one client (scheduled drafts and held rows included), plus the
 * context line (accountant, instance).
 */
export const adminGetClientConversation: RequestHandler = async (req, res) => {
  const clientId = z.string().uuid().safeParse(req.params.clientId);
  const client = clientId.success ? await clients.getById(clientId.data) : null;
  if (!client) {
    res.status(404).json({ error: 'Client not found.' });
    return;
  }
  const [instance, accountant, thread] = await Promise.all([
    client.agent_instance_id ? agentInstances.getById(client.agent_instance_id) : null,
    client.user_id ? users.getById(client.user_id) : null,
    emails.listFullThreadForClient(client.id),
  ]);
  res.json({
    client: toAdminClient(client),
    agentInstanceId: instance?.id ?? null,
    agentType: instance?.agent_type ?? null,
    instanceName: instance?.name ?? null,
    accountantEmail: accountant?.email ?? null,
    accountantName: accountant?.hebrew_name ?? accountant?.name ?? null,
    messages: thread.map(toAdminMessage),
  });
};

const CallsQuerySchema = z.object({
  agentInstanceId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  purpose: z.string().max(40).optional(),
  model: z.string().max(80).optional(),
  before: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function toAdminCall(r: Omit<llmCalls.LlmCallRow, 'request' | 'response'> & { client_name?: string | null }) {
  return {
    id: r.id,
    createdAt: r.created_at,
    userId: r.user_id,
    agentInstanceId: r.agent_instance_id,
    clientId: r.client_id,
    clientName: 'client_name' in r ? (r.client_name ?? null) : null,
    purpose: r.purpose,
    provider: r.provider,
    model: r.model,
    status: r.status,
    error: r.error,
    attempts: r.attempts,
    durationMs: r.duration_ms,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    thinkingTokens: r.thinking_tokens,
    cachedTokens: r.cached_tokens,
    inputPricePerToken: r.input_price_per_token,
    outputPricePerToken: r.output_price_per_token,
    thinkingPricePerToken: r.thinking_price_per_token,
    cachedPricePerToken: r.cached_price_per_token,
    cost: r.cost,
  };
}

/**
 * GET /api/admin/llm-calls — newest-first page of calls (payloads excluded),
 * filterable by instance/client/purpose/model. Keyset pagination:
 * pass the last row's createdAt back as ?before= for the next page.
 */
export const adminListLlmCalls: RequestHandler = async (req, res) => {
  const parsed = CallsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid filters.' });
    return;
  }
  const rows = await llmCalls.list(parsed.data);
  res.json({
    calls: rows.map(toAdminCall),
    nextBefore: rows.length === parsed.data.limit ? (rows[rows.length - 1]?.created_at ?? null) : null,
  });
};

/** GET /api/admin/llm-calls/:id — one call with the exact request payload and the raw response. */
export const adminGetLlmCall: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const row = id.success ? await llmCalls.getById(id.data) : null;
  if (!row) {
    res.status(404).json({ error: 'Call not found.' });
    return;
  }
  const client = row.client_id ? await clients.getById(row.client_id) : null;
  res.json({
    call: {
      ...toAdminCall(row),
      clientName: client?.name ?? null,
      request: row.request,
      response: row.response,
    },
  });
};
