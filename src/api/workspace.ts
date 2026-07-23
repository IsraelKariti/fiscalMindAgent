import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import * as clients from '../db/queries/clients.js';
import * as clientDocuments from '../db/queries/clientDocuments.js';
import * as dashboard from '../db/queries/dashboard.js';
import * as documentFiles from '../db/queries/documentFiles.js';
import * as emails from '../db/queries/emails.js';
import { deleteBlob, downloadBlob } from '../storage/blob.js';
import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import * as waSenders from '../db/queries/waSenders.js';
import { normalizeE164 } from '../util/phone.js';
import * as scheduledJobs from '../db/queries/scheduledJobs.js';
import { withClientLock } from '../db/withClientLock.js';
import {
  onClientUpdated,
  onInstanceClientsUpdated,
  publishClientUpdated,
  publishInstanceClientsUpdated,
} from '../events/clientEvents.js';
import { pauseFutureEmail } from '../orchestration/pauseFutureEmail.js';
import { removeFutureEmail } from '../orchestration/removeFutureEmail.js';
import { resumeFutureEmail } from '../orchestration/resumeFutureEmail.js';
import { retryFailedSend } from '../orchestration/retryFailedSend.js';
import { sendFutureEmailNow } from '../orchestration/sendFutureEmailNow.js';
import { setFutureEmail } from '../orchestration/setFutureEmail.js';
import { getAgentType, listAgentTypes } from '../agents/registry.js';
import { resolveSenderMailbox } from '../agents/instanceEmail.js';
import { logger } from '../util/logger.js';
import { draftFirstEmail } from './draftFirstEmail.js';
import { DueDateSchema } from './schemas.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const ClientPatchSchema = z
  .object({
    name: z.string().min(1).optional(),
    occupation: z.string().nullable().optional(),
    phone: z.string().nullable().optional(),
    company: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  })
  .strict();

const WhatsAppToggleSchema = z
  .object({
    enabled: z.boolean(),
    /** Required when enabling unless the client already has a stored wa_phone. */
    phone: z.string().optional(),
  })
  .strict();

const PauseToggleSchema = z.object({ paused: z.boolean() }).strict();

const DocumentCreateSchema = z
  .object({
    name: z.string().min(1).max(200),
    description: z.string().max(2000).nullable().optional(),
  })
  .strict();

const ClientCreateSchema = z
  .object({
    name: z.string().min(1),
    email: z.string().email(),
    // Optional; any usable number turns the WhatsApp channel on by default.
    phone: z.string().nullable().optional(),
    documents: z.array(DocumentCreateSchema).max(50).default([]),
    // Optional collection deadline; the agent paces its follow-ups toward it.
    dueDate: DueDateSchema.nullable().optional(),
  })
  .strict();

/** Postgres rejects non-UUID ids with an error (→ 500); pre-validate so they 404 like other misses. */
function uuidParam(value: string | undefined): string | null {
  return value && z.string().uuid().safeParse(value).success ? value : null;
}

/**
 * The agent workspace API: one agent instance's clients, files, conversation
 * and dashboard. Carries no auth of its own — it is mounted (via
 * resolveAgentInstance, which sets req.agentInstance) with the caller's auth
 * in front:
 *   - /api/agents/:agentId/* and /api/*            (session cookie)
 *   - /api/monday/app/agents/:agentId/* and /api/monday/app/*  (monday sessionToken)
 * The unprefixed legacy mounts resolve to the user's doc_collector instance.
 */
export const workspaceRouter = Router();

// Slightly wider than the 8 Monday-based weeks the activity chart shows, so the
// oldest visible week is always fully covered regardless of timezone.
const ACTIVITY_WINDOW_DAYS = 70;

workspaceRouter.get(
  '/dashboard',
  wrap(async (req, res) => {
    const [clientSummaries, activity, filesTotal] = await Promise.all([
      dashboard.listClientSummariesForInstance(req.agentInstance!.id),
      dashboard.listEmailActivityForInstance(req.agentInstance!.id, ACTIVITY_WINDOW_DAYS),
      dashboard.countFilesForInstance(req.agentInstance!.id),
    ]);
    res.json({ clients: clientSummaries, activity, filesTotal });
  }),
);

workspaceRouter.get(
  '/clients',
  wrap(async (req, res) => {
    res.json({ clients: await clients.listForInstance(req.agentInstance!.id) });
  }),
);

// SSE stream of "this instance's client roster changed" ticks (import scan, daily
// auto-enroll, add/delete from another tab), relayed from Redis pub/sub so enrollments
// made by the worker process arrive too. The events carry no data — the browser
// refetches the list — so a dropped connection loses nothing.
workspaceRouter.get(
  '/events',
  wrap(async (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const unsubscribe = onInstanceClientsUpdated(req.agentInstance!.id, () => res.write('data: updated\n\n'));
    // Comment-only heartbeat so idle proxies (ngrok, Azure ingress) don't cut the stream.
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }),
);

// This agent's dedicated sender address (read-only; admins assign it at
// activation or on the agent page — null for agent types that don't email
// clients or pre-mandatory-email instances that never got an address).
workspaceRouter.get(
  '/email-sender',
  wrap(async (req, res) => {
    const sender = await agentMailboxes.getByInstanceId(req.agentInstance!.id);
    res.json({ assigned: sender !== null, emailAddress: sender?.email_address ?? null });
  }),
);

// This agent's dedicated WhatsApp sender number (read-only; admins assign it).
workspaceRouter.get(
  '/wa-sender',
  wrap(async (req, res) => {
    const sender = await waSenders.getByInstanceId(req.agentInstance!.id);
    res.json({ assigned: sender !== null, phoneNumber: sender?.phone_number ?? null });
  }),
);

workspaceRouter.post(
  '/clients',
  wrap(async (req, res) => {
    const parsed = ClientCreateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid client fields.', details: parsed.error.flatten() });
      return;
    }
    const { name, email, phone, documents, dueDate } = parsed.data;

    // Email-capable agents can't take clients without a sender address —
    // the first email could never send. Admins assign the address.
    if (
      getAgentType(req.agentInstance!.agent_type).emailSuffix &&
      !(await resolveSenderMailbox(req.agentInstance!.id, req.userId!))
    ) {
      res.status(409).json({ error: 'This agent has no email address yet — an administrator must assign one.' });
      return;
    }
    if (await clients.getByEmailAddressForInstance(req.agentInstance!.id, email)) {
      res.status(409).json({ error: 'A client with this email already exists.' });
      return;
    }

    const client = await clients.insert({
      userId: req.userId!,
      agentInstanceId: req.agentInstance!.id,
      name,
      emailAddress: email,
      phone: phone || null,
      agentFields: dueDate ? { due_date: dueDate } : undefined,
    });
    for (const doc of documents) {
      await clientDocuments.insert({ clientId: client.id, name: doc.name, description: doc.description ?? null });
    }
    // Respond before the LLM drafts the first email — the drafting takes seconds, and the
    // conversation tab shows a "drafting…" placeholder until the scheduled email appears.
    // Only follow-up agents initiate; an immediate_reply agent (customer service)
    // never drafts first, so kicking it off would leave the client in "drafting…" forever.
    if (getAgentType(req.agentInstance!.agent_type).conversationModel === 'scheduled_follow_up') {
      draftFirstEmail(client.id);
    }
    publishInstanceClientsUpdated(req.agentInstance!.id);
    res.status(201).json({ client });
  }),
);

workspaceRouter.get(
  '/clients/:id',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    // The pending BullMQ job id embeds the draft email id: send_email:<clientId>:<emailId>.
    const job = await scheduledJobs.getForClient(client.id);
    let nextScheduled = null;
    if (job) {
      const draftId = job.bullmq_job_id.split(':')[2];
      const draft = draftId ? await emails.getById(draftId) : null;
      nextScheduled = {
        scheduledFor: job.scheduled_for,
        sendFailedAt: job.send_failed_at,
        channel: draft?.channel ?? 'email',
        subject: draft?.subject ?? null,
        body: draft?.body ?? null,
        reasoning: draft?.reasoning ?? null,
      };
    }

    res.json({ client, nextScheduled, documents: await clientDocuments.listForClient(client.id) });
  }),
);

// SSE stream of "something about this client changed" ticks (reply stored, pending send
// canceled, new draft scheduled, goal completed), relayed from Redis pub/sub so transitions
// made by the worker process arrive too. The events carry no data — the browser refetches —
// so a dropped connection loses nothing the fallback poll won't recover.
workspaceRouter.get(
  '/clients/:id/events',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const unsubscribe = onClientUpdated(client.id, () => res.write('data: updated\n\n'));
    // Comment-only heartbeat so idle proxies (ngrok, Azure ingress) don't cut the stream.
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  }),
);

workspaceRouter.patch(
  '/clients/:id',
  wrap(async (req, res) => {
    const parsed = ClientPatchSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid client fields.', details: parsed.error.flatten() });
      return;
    }
    const id = uuidParam(req.params.id);
    let client = id ? await clients.updateDetailsForInstance(id, req.agentInstance!.id, parsed.data) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    // WhatsApp is on by default: giving the client a phone number opens the
    // channel right away (unless they opted out or already have one stored).
    const waPhone = parsed.data.phone ? normalizeE164(parsed.data.phone) : null;
    if (waPhone) {
      const enabled = await clients.autoEnableWhatsApp(client.id, waPhone);
      if (enabled) {
        client = enabled;
        // Channel availability changed — let the agent re-decide the pending message.
        if (enabled.goal_status === 'pending') {
          await withClientLock(enabled.id, async () => {
            await removeFutureEmail(enabled.id);
            await setFutureEmail(enabled.id);
          });
        }
      }
    }
    res.json({ client });
  }),
);

// WhatsApp opt-in toggle. Enabling asserts the accountant obtained the
// client's consent (recorded via wa_opted_in_at/by); disabling must also stop
// any already-scheduled WhatsApp draft, so both directions re-plan the next
// message under the client lock.
workspaceRouter.put(
  '/clients/:id/whatsapp',
  wrap(async (req, res) => {
    const parsed = WhatsAppToggleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Expected { enabled: boolean, phone?: string }.' });
      return;
    }
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    let updated;
    if (parsed.data.enabled) {
      if (!(await waSenders.getByInstanceId(req.agentInstance!.id))) {
        res.status(409).json({ error: 'No WhatsApp number is assigned to this agent yet.' });
        return;
      }
      const rawPhone = parsed.data.phone ?? client.wa_phone;
      const waPhone = rawPhone ? normalizeE164(rawPhone) : null;
      if (!waPhone) {
        res.status(400).json({ error: 'A valid phone number is required to enable WhatsApp (e.g. 050-1234567 or +972501234567).' });
        return;
      }
      try {
        updated = await clients.enableWhatsApp(client.id, { waPhone, optedInBy: req.userId! });
      } catch (err) {
        // 23505 = unique_violation on (agent_instance_id, wa_phone): another of this
        // agent's clients already uses this number.
        if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
          res.status(409).json({ error: 'Another client of yours already uses this phone number.' });
          return;
        }
        throw err;
      }
    } else {
      updated = await clients.disableWhatsApp(client.id);
    }
    if (!updated) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    // Channel availability changed — let the agent re-decide the pending message.
    if (updated.goal_status === 'pending') {
      await withClientLock(updated.id, async () => {
        await removeFutureEmail(updated.id);
        await setFutureEmail(updated.id);
      });
    }
    res.json({ client: updated });
  }),
);

workspaceRouter.delete(
  '/clients/:id',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    // Cancel the pending BullMQ send under the client lock so an in-flight draft/send settles first,
    // then snapshot blob keys before the cascade wipes the document_files rows.
    await withClientLock(client.id, () => removeFutureEmail(client.id));
    const files = await documentFiles.listForClient(client.id);
    await clients.removeForInstance(client.id, req.agentInstance!.id);
    publishInstanceClientsUpdated(req.agentInstance!.id);
    // Best-effort blob cleanup after the rows are gone — a failure only orphans a blob.
    await Promise.all(
      files.map((file) =>
        deleteBlob(file.blob_key).catch((err) =>
          logger.error('delete client: blob cleanup failed', { blobKey: file.blob_key, err }),
        ),
      ),
    );
    res.json({ ok: true });
  }),
);

workspaceRouter.get(
  '/clients/:id/files',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    res.json({ files: await documentFiles.listForClient(client.id) });
  }),
);

// Streams the blob through the API so the container stays private and access
// rides the dashboard session (no SAS URLs to leak).
workspaceRouter.get(
  '/clients/:id/files/:fileId/download',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const fileId = uuidParam(req.params.fileId);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    const file = client && fileId ? await documentFiles.getForClient(fileId, client.id) : null;
    if (!file) {
      res.status(404).json({ error: 'File not found.' });
      return;
    }
    const blob = await downloadBlob(file.blob_key);
    res.setHeader('Content-Type', file.content_type);
    if (blob.contentLength) res.setHeader('Content-Length', blob.contentLength);
    // RFC 5987 encoding: filenames are sanitized ASCII at ingest, but stay defensive.
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`);
    blob.stream.pipe(res);
  }),
);

workspaceRouter.get(
  '/clients/:id/emails',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    res.json({ emails: await emails.listForClient(client.id) });
  }),
);

// Pause switch for the agent's outreach. Pausing pulls the pending job out of the
// queue but preserves the draft and its scheduled time; the paused flag then keeps
// setFutureEmail from scheduling anything new when replies come in. Resuming restores
// the preserved send as-is when its time is still in the future, and only redrafts
// when that time passed while paused (or a reply obsoleted the draft). The flag is
// flipped before taking the client lock so a send that is mid-flight re-plans into
// the new state.
workspaceRouter.put(
  '/clients/:id/pause',
  wrap(async (req, res) => {
    const parsed = PauseToggleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Expected { paused: boolean }.' });
      return;
    }
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }

    const paused = await clients.setPaused(client.id, parsed.data.paused);
    if (!paused) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    let updated = paused;

    if (parsed.data.paused) {
      await withClientLock(updated.id, () => pauseFutureEmail(updated.id));
    } else if (updated.goal_status === 'pending') {
      // Resuming an overdue-stopped client hands it back to the agent: drop the
      // "handed off" marker (the notified stamp stays — no repeat email for the
      // same due date).
      if (typeof updated.agent_fields['overdue_stopped_at'] === 'string') {
        await clients.clearOverdueStopped(updated.id);
        updated = (await clients.getById(updated.id)) ?? updated;
      }
      await withClientLock(client.id, () => resumeFutureEmail(client.id));
    }
    res.json({ client: updated });
  }),
);

// Manual retry for a draft that failed (draft_failed_at set) or was abandoned mid-flight
// (crash/restart killed setFutureEmail, leaving a stale drafting_since). The drafting
// stamp is refreshed before responding so the timeline flips straight back to the
// "drafting…" placeholder, then the re-plan runs in the background like client creation;
// a failure lands back in draft_failed_at via setFutureEmail's own bookkeeping.
workspaceRouter.post(
  '/clients/:id/redraft',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    if (client.goal_status !== 'pending' || client.paused) {
      res.status(409).json({ error: 'Nothing to draft — the goal is complete or the client is paused.' });
      return;
    }

    await clients.markDraftingStarted(client.id);
    publishClientUpdated(client.id);
    withClientLock(client.id, async () => {
      await removeFutureEmail(client.id);
      await setFutureEmail(client.id);
    }).catch((err) => logger.error('manual redraft failed', err, { clientId: client.id }));
    res.status(202).json({ ok: true });
  }),
);

// "Send now": jump the scheduled follow-up's queue delay so the worker sends it right away.
workspaceRouter.post(
  '/clients/:id/send-now',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    const result = await withClientLock(client.id, () => sendFutureEmailNow(client.id));
    if (result === 'none_scheduled') {
      res.status(409).json({ error: 'There is no scheduled email to send.' });
      return;
    }
    if (result === 'send_failed') {
      res.status(409).json({ error: 'The last send attempt failed — retry it instead.' });
      return;
    }
    // 'already_sending' also counts as success — the email is going out now either way.
    res.json({ ok: true });
  }),
);

// Retry a scheduled send whose attempt failed (send_failed_at set): re-fires the
// same draft immediately, unlike /redraft which discards it and re-plans.
workspaceRouter.post(
  '/clients/:id/retry-send',
  wrap(async (req, res) => {
    const id = uuidParam(req.params.id);
    const client = id ? await clients.getByIdForInstance(id, req.agentInstance!.id) : null;
    if (!client) {
      res.status(404).json({ error: 'Client not found.' });
      return;
    }
    const result = await withClientLock(client.id, () => retryFailedSend(client.id));
    if (result === 'no_failed_send') {
      res.status(409).json({ error: 'There is no failed send to retry.' });
      return;
    }
    res.json({ ok: true });
  }),
);

// Agent-type-specific routes (e.g. the doc collector's required-documents CRUD).
// Each router guards on req.agentInstance.agent_type and skips itself otherwise.
for (const definition of listAgentTypes()) {
  if (definition.buildRouter) workspaceRouter.use(definition.buildRouter());
}
