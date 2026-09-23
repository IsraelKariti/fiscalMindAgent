import { z } from 'zod';
import { describeLlmStages } from '../gemini/llmStages.js';
import type { RequestHandler } from 'express';
import * as agentInstances from '../db/queries/agentInstances.js';
import * as auditEvents from '../db/queries/auditEvents.js';
import * as clients from '../db/queries/clients.js';
import * as documentFiles from '../db/queries/documentFiles.js';
import * as emails from '../db/queries/emails.js';
import * as llmCalls from '../db/queries/llmCalls.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import * as users from '../db/queries/users.js';
import type { ClientRow, EmailRow } from '../db/types.js';
import { streamFile } from './fileStream.js';
import { resolveCallFile, resolveStepFile } from './stepFile.js';

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
  const [instance, accountant, thread, calls, steps, job] = await Promise.all([
    client.agent_instance_id ? agentInstances.getById(client.agent_instance_id) : null,
    client.user_id ? users.getById(client.user_id) : null,
    emails.listFullThreadForClient(client.id),
    llmCalls.list({ clientId: client.id, limit: 200 }),
    auditEvents.listForClient(client.id, 500),
    scheduledJobs.getForClient(client.id),
  ]);
  // A replan discards the pending draft (removeFutureEmail drops its job but
  // keeps the row), so any unsent outbound row other than the live job's
  // draft is a discarded one. Its `send_reply` step and the generate_message
  // call that drafted it are flagged so the timeline can drop them too — a
  // planning step whose only output was thrown away is noise. (A call whose
  // cycle also applied state changes is kept, see below.)
  const liveDraftId = job?.bullmq_job_id.split(':')[2] ?? null;
  const discardedDraftIds = new Set(
    thread
      .filter((m) => m.direction === 'outbound' && (m.status === 'draft' || m.status === 'held') && m.id !== liveDraftId)
      .map((m) => m.id),
  );
  const discardedStepIds = new Set<string>();
  const discardedCallIds = new Set<string>();
  // A call's row is written fire-and-forget after the answer returns, so it
  // can land AFTER the pipeline's own send_reply step for that answer — match
  // by the call's START (row time minus duration), which always precedes it.
  const generateCalls = calls
    .filter((c) => c.purpose === 'generate_message')
    .map((c) => ({ id: c.id, startedAt: c.created_at.getTime() - (c.duration_ms ?? 0) }))
    .sort((a, b) => a.startedAt - b.startedAt);
  for (const s of steps) {
    if (s.action !== 'send_reply') continue;
    const emailId = typeof s.detail['emailId'] === 'string' ? (s.detail['emailId'] as string) : null;
    if (!emailId || !discardedDraftIds.has(emailId)) continue;
    discardedStepIds.add(s.id);
    // The call that drafted it: the last generate_message started before the step.
    const call = generateCalls.filter((c) => c.startedAt <= s.occurred_at.getTime()).pop();
    if (!call) continue;
    // The same call also decides the apply_* state changes, and those survive
    // the replan — keep the call visible when its cycle applied anything, or
    // the apply_* rows would show with no LLM stage that decided them.
    const applied = steps.some(
      (a) =>
        a.action.startsWith('apply_') &&
        a.occurred_at.getTime() >= call.startedAt &&
        a.occurred_at.getTime() <= s.occurred_at.getTime(),
    );
    if (!applied) discardedCallIds.add(call.id);
  }
  res.json({
    client: toAdminClient(client),
    agentInstanceId: instance?.id ?? null,
    agentType: instance?.agent_type ?? null,
    instanceName: instance?.name ?? null,
    accountantEmail: accountant?.email ?? null,
    accountantName: accountant?.hebrew_name ?? accountant?.name ?? null,
    messages: thread.map((m) => ({ ...toAdminMessage(m), discarded: discardedDraftIds.has(m.id) })),
    // The same conversation as the pipeline saw it: every LLM call and every
    // code step (gates, apply_*, send_reply) so the viewer can interleave them
    // with the messages into one timeline.
    calls: calls.map((c) => ({ ...toAdminCall(c), discarded: discardedCallIds.has(c.id) })),
    steps: steps.map((e) => ({ ...toAdminStep(e), discarded: discardedStepIds.has(e.id) })),
  });
};

/** One audit row as a trace step — the shape both the conversation and the single-step endpoint emit. */
function toAdminStep(e: auditEvents.AuditEventListRow) {
  return {
    id: e.id,
    occurredAt: e.occurred_at,
    actorType: e.actor_type,
    action: e.action,
    targetType: e.target_type,
    targetId: e.target_id,
    severity: e.severity,
    suspectedInjection: e.suspected_injection,
    detail: e.detail,
  };
}

/**
 * GET /api/admin/audit-events/:id — one code step by id, for the step link
 * (#/steps/:id). No `discarded` flag: that is computed from the whole thread
 * and only decides whether the timeline hides a row.
 */
export const adminGetAuditEvent: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const row = id.success ? await auditEvents.getById(id.data) : null;
  if (!row) {
    res.status(404).json({ error: 'Step not found.' });
    return;
  }
  res.json({ step: toAdminStep(row) });
};

/** The received file a step is about (its audit row targets a document_file), or null. */
const stepFileOf = (stepId: string | undefined) =>
  resolveStepFile(stepId, { getStep: auditEvents.getById, getFile: documentFiles.getById });

/** The received file an LLM call read (llm_calls.document_file_id), or null. */
const callFileOf = (callId: string | undefined) =>
  resolveCallFile(callId, { getCall: llmCalls.getFileRef, getFile: documentFiles.getById });

type FileOf = (id: string | undefined) => Promise<Awaited<ReturnType<typeof documentFiles.getById>>>;

/** Name and type of the file a row is about, for a detail modal's document pane; 404 when there is none. */
function fileMetaHandler(fileOf: FileOf): RequestHandler {
  return async (req, res) => {
    const file = await fileOf(req.params.id);
    if (!file) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    res.json({
      file: {
        id: file.id,
        filename: file.filename,
        label: file.label,
        parentFileId: file.parent_file_id,
        contentType: file.content_type,
      },
    });
  };
}

/** The file itself, streamed under the admin session. */
function fileServeHandler(fileOf: FileOf, disposition: 'attachment' | 'inline'): RequestHandler {
  return async (req, res) => {
    const file = await fileOf(req.params.id);
    if (!file) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    await streamFile(res, file, disposition);
  };
}

/**
 * GET /api/admin/audit-events/:id/file — name and type of the file a step
 * checked, for the step detail modal's document pane. Keyed by the step id so
 * it works wherever the step opens (a step link needs no impersonation).
 */
export const adminGetStepFile: RequestHandler = fileMetaHandler(stepFileOf);

/** GET /api/admin/audit-events/:id/file/view | /download — the file itself, streamed under the admin session. */
export const adminServeStepFile = (disposition: 'attachment' | 'inline'): RequestHandler => fileServeHandler(stepFileOf, disposition);

/**
 * GET /api/admin/llm-calls/:id/file — name and type of the file an LLM call
 * read, for the call detail modal's document pane. Keyed by the call id, like
 * the step endpoints: the browser never names a file id.
 */
export const adminGetCallFile: RequestHandler = fileMetaHandler(callFileOf);

/** GET /api/admin/llm-calls/:id/file/view | /download — the file itself, streamed under the admin session. */
export const adminServeCallFile = (disposition: 'attachment' | 'inline'): RequestHandler => fileServeHandler(callFileOf, disposition);

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
    documentFileId: r.document_file_id,
    documentFileName: r.document_filename,
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

/** GET /api/admin/llm-stages — every LLM stage as the code defines it (prompt templates, query layout, schema, resolved model). */
export const adminListLlmStages: RequestHandler = async (_req, res) => {
  res.json({ stages: await describeLlmStages() });
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
