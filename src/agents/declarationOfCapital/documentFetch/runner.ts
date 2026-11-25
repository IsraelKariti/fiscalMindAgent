import * as clients from '../../../db/queries/clients.js';
import * as emails from '../../../db/queries/emails.js';
import * as documentFetchSessions from '../../../db/queries/documentFetchSessions.js';
import * as waSenders from '../../../db/queries/waSenders.js';
import { withClientLock } from '../../../db/withClientLock.js';
import { publishClientUpdated } from '../../../events/clientEvents.js';
import { removeFutureEmail } from '../../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../../orchestration/setFutureEmail.js';
import { getFetchClient } from './fetchClient.js';
import { evidencePrefixFor } from './stepEvidence.js';
import { getProviderSpec, type FetchProviderSpec } from './providers.js';
import { FetchAtCapacityError, NoDocumentsOnSiteError, OtpRejectedError, SessionGoneError } from './types.js';
import { sessionTracker } from './sessionTracker.js';
import { agentWorkBlocked } from '../../killSwitch.js';
import { recordAudit } from '../../../audit/audit.js';
import { sendWhatsAppTextAndRecord } from '../../../twilio/sendAndRecord.js';
import { logger } from '../../../util/logger.js';
import type { ClientRow } from '../../../db/types.js';
import { enqueueDocumentFetch, type DocumentFetchJob } from '../../../queue/documentFetchQueue.js';
import { deliver } from './deliver.js';

const MAX_OTP_ATTEMPTS = 3;

// The heads-up message may still be a queued draft when the delayed start_login
// job fires; re-check on this cadence before giving up (an abandoned draft —
// superseded by a client reply — never sends, so the login must never run).
const START_WAIT_RETRY_MS = 10_000;
const MAX_START_WAIT_ATTEMPTS = 6;

// The intercept accepts a code while the session is still 'logging_in' (the OTP
// fires at the credential submit, moments before 'awaiting_otp'). The submit job
// then waits for the login to settle on this cadence; generous max because in
// ACI mode the login job can sit minutes in container provisioning first.
const OTP_SETTLE_RETRY_MS = 10_000;
const MAX_OTP_SETTLE_ATTEMPTS = 30;

/** Sends a canned WhatsApp line to the client; never throws (progress messaging is best-effort). */
async function sendCanned(client: ClientRow, body: string): Promise<void> {
  try {
    const sender = client.agent_instance_id ? await waSenders.getByInstanceId(client.agent_instance_id) : null;
    if (!sender || !client.wa_phone) {
      logger.warn('document fetch: client not whatsapp-reachable, skipping progress message', { clientId: client.id });
      return;
    }
    await sendWhatsAppTextAndRecord(client.id, {
      from: sender.phone_number,
      to: client.wa_phone,
      body,
      reasoning: 'document fetch progress',
      agentInstanceId: client.agent_instance_id,
    });
  } catch (err) {
    logger.error('document fetch: progress message send failed', err, { clientId: client.id });
  }
}

/**
 * Keepalive after a terminal fetch outcome (failed/expired): the canned status
 * line is not a scheduled follow-up, so without this the conversation dies
 * unless the client happens to write back. Re-plan — same as deliver() does on
 * success — so the agent drafts the recovery message with the terminal state in
 * view. Best-effort: the fetch outcome itself is already recorded.
 */
async function replanAfterFetchEnd(clientId: string): Promise<void> {
  try {
    await withClientLock(clientId, async () => {
      await removeFutureEmail(clientId, 'document_fetch');
      await setFutureEmail(clientId, 'document_fetch');
    });
  } catch (err) {
    logger.error('document fetch: post-outcome re-plan failed', err, { clientId });
  }
}

export async function runDocumentFetchJob(job: DocumentFetchJob): Promise<void> {
  switch (job.kind) {
    case 'start_login':
      return runStartLogin(job);
    case 'submit_otp':
      return runSubmitOtp(job);
    case 'cancel':
      return runCancel(job.sessionId);
  }
}

async function runStartLogin(job: Extract<DocumentFetchJob, { kind: 'start_login' }>): Promise<void> {
  const { sessionId } = job;
  const session = await documentFetchSessions.getById(sessionId);
  if (!session) return;
  // The job runs delayed; the session may have been cancelled (or already
  // started) while it waited — only the pre-login statuses may proceed.
  if (session.status !== 'agreed' && session.status !== 'wa_intro_sent') {
    logger.info('document fetch: start_login skipped, session no longer pre-login', { sessionId, status: session.status });
    return;
  }
  const client = await clients.getById(session.client_id);
  if (!client) return;

  // Re-check at act time: the agent (or the whole platform) may have been
  // disabled while this job sat delayed — the login must then never fire the
  // real OTP email. No client message: the instance was shut off deliberately.
  const blocked = await agentWorkBlocked(client);
  if (blocked) {
    await documentFetchSessions.updateStatus(sessionId, 'cancelled');
    logger.warn('document fetch: agent disabled, cancelling before login', { sessionId, reason: blocked });
    publishClientUpdated(client.id);
    return;
  }

  // The login triggers the real OTP email — it may only run after the message
  // telling the client to expect the code has actually been sent.
  if (job.awaitEmailId) {
    const headsUp = await emails.getById(job.awaitEmailId);
    if (!headsUp) {
      logger.warn('document fetch: heads-up message row missing, not starting login', { sessionId, emailId: job.awaitEmailId });
      return; // session stays pre-login; a later re-plan can start again
    }
    if (headsUp.status !== 'sent') {
      const attempt = job.awaitAttempt ?? 0;
      if (attempt >= MAX_START_WAIT_ATTEMPTS) {
        // Superseded or failed draft — it will never send. Leave the session
        // pre-login; the next client reply re-plans and can start afresh.
        logger.warn('document fetch: heads-up message never sent, giving up on this start_login', {
          sessionId,
          emailId: job.awaitEmailId,
          status: headsUp.status,
        });
        return;
      }
      await enqueueDocumentFetch({ ...job, awaitAttempt: attempt + 1 }, { delayMs: START_WAIT_RETRY_MS });
      return;
    }
  }

  let spec: FetchProviderSpec;
  try {
    spec = getProviderSpec(session.provider);
  } catch (err) {
    // A provider id the worker doesn't know (bad row / version skew) — the
    // fetch can never run; fail without a client message.
    logger.error('document fetch: unknown provider on session', err, { sessionId, provider: session.provider });
    await documentFetchSessions.updateStatus(sessionId, 'failed', { error: errText(err) });
    publishClientUpdated(client.id);
    return;
  }

  const credentials = await spec.buildCredentials(client);
  if (!credentials) {
    await documentFetchSessions.updateStatus(sessionId, 'failed', { error: 'no portal credentials on file' });
    await sendCanned(client, spec.messages.loginFailed);
    publishClientUpdated(client.id);
    await replanAfterFetchEnd(client.id);
    return;
  }

  // Each live session is a real browser on the runner; refuse rather than pile up.
  if (sessionTracker.atCapacity()) {
    await sendCanned(client, spec.messages.busy);
    logger.warn('document fetch: at session capacity, deferring', { sessionId });
    return; // stays 'agreed'/'wa_intro_sent'; the client can trigger again
  }

  await documentFetchSessions.updateStatus(sessionId, 'logging_in');
  const fetchClient = getFetchClient();
  try {
    await fetchClient.startLogin(sessionId, spec.id, credentials);
    sessionTracker.put({ sessionId, clientId: client.id, provider: spec.id });
    await documentFetchSessions.updateStatus(sessionId, 'awaiting_otp', { otpRequestedAt: new Date() });
    // The credential submit just fired the real OTP, which lives ~4 minutes.
    // The LLM's heads-up (verified sent above) preceded browser startup by up to
    // minutes, so the client needs this line at the actual moment — after the
    // status flip, so a lightning-fast reply already matches the OTP intercept.
    await sendCanned(client, spec.messages.otpSent);
    // 'warning' severity: this just fired a real OTP email at a real citizen —
    // the single most sensitive action the platform takes.
    recordAudit({
      actorType: 'agent',
      action: 'document_fetch.login_started',
      agentInstanceId: client.agent_instance_id,
      clientId: client.id,
      targetType: 'document_fetch_session',
      targetId: sessionId,
      severity: 'warning',
      detail: {
        clientName: client.name,
        provider: spec.id,
        taxYear: session.tax_year,
        evidencePrefix: evidencePrefixFor(sessionId, session.created_at),
      },
    });
    publishClientUpdated(client.id);
  } catch (err) {
    if (err instanceof FetchAtCapacityError) {
      // The runner is serving other fetches; same deferral as the local check.
      await documentFetchSessions.updateStatus(sessionId, session.status);
      await sendCanned(client, spec.messages.busy);
      logger.warn('document fetch: runner at capacity, deferring', { sessionId });
      return;
    }
    logger.error('document fetch: login failed', err, { sessionId, clientId: client.id });
    sessionTracker.discard(sessionId);
    await fetchClient.close(sessionId);
    await documentFetchSessions.updateStatus(sessionId, 'failed', { error: errText(err) });
    recordDocumentFetchFailure(client, sessionId, 'login', errText(err), evidencePrefixFor(sessionId, session.created_at));
    await sendCanned(client, spec.messages.loginFailed);
    publishClientUpdated(client.id);
    await replanAfterFetchEnd(client.id);
  }
}

async function runSubmitOtp(job: Extract<DocumentFetchJob, { kind: 'submit_otp' }>): Promise<void> {
  const { sessionId, otp } = job;

  // Code arrived before the login settled — wait for 'awaiting_otp' (or a
  // terminal status, which the tracker-miss path below handles) instead of
  // burning the client's code.
  const row = await documentFetchSessions.getById(sessionId);
  if (row?.status === 'logging_in') {
    const attempt = job.awaitAttempt ?? 0;
    if (attempt >= MAX_OTP_SETTLE_ATTEMPTS) {
      logger.warn('document fetch: login never settled, dropping early otp', { sessionId, attempt });
      return;
    }
    await enqueueDocumentFetch({ ...job, awaitAttempt: attempt + 1 }, { delayMs: OTP_SETTLE_RETRY_MS });
    return;
  }

  const fetchClient = getFetchClient();
  const live = sessionTracker.take(sessionId);
  if (!live) {
    // The session is gone (TTL expired or worker restarted). Reap any remote
    // browser, move the row on and tell the client.
    await fetchClient.close(sessionId);
    const session = await documentFetchSessions.getById(sessionId);
    if (session && session.status === 'awaiting_otp') {
      await documentFetchSessions.updateStatus(sessionId, 'expired', { error: 'otp submitted after session was lost' });
      const client = await clients.getById(session.client_id);
      if (client) {
        await sendCanned(client, getProviderSpec(session.provider).messages.otpExpired);
        publishClientUpdated(client.id);
        await replanAfterFetchEnd(client.id);
      }
    }
    return;
  }

  const spec = getProviderSpec(live.provider);
  const client = await clients.getById(live.clientId);
  if (!client) {
    await fetchClient.close(sessionId);
    return;
  }

  // A running fetch holds a live browser on the runner; disabling the agent
  // (or the kill switch) must tear it down, not let the fetch complete.
  const blocked = await agentWorkBlocked(client);
  if (blocked) {
    await fetchClient.close(sessionId);
    await documentFetchSessions.updateStatus(sessionId, 'cancelled');
    logger.warn('document fetch: agent disabled, dropping otp and closing browser', { sessionId, reason: blocked });
    publishClientUpdated(client.id);
    return;
  }

  try {
    await documentFetchSessions.updateStatus(sessionId, 'verifying');
    await fetchClient.submitOtp(sessionId, otp);
  } catch (err) {
    if (err instanceof OtpRejectedError) {
      const attempts = await documentFetchSessions.incrementOtpAttempts(sessionId);
      if (attempts < MAX_OTP_ATTEMPTS) {
        // The runner kept the page on the OTP screen; re-arm the wait for another code.
        sessionTracker.put({ sessionId, clientId: client.id, provider: live.provider });
        await documentFetchSessions.updateStatus(sessionId, 'awaiting_otp');
        await sendCanned(client, spec.messages.otpRejected);
        publishClientUpdated(client.id);
        return;
      }
      await fetchClient.close(sessionId);
      await documentFetchSessions.updateStatus(sessionId, 'failed', { error: 'otp rejected too many times' });
      recordDocumentFetchFailure(client, sessionId, 'otp', 'otp rejected too many times');
      await sendCanned(client, spec.messages.otpGaveUp);
      publishClientUpdated(client.id);
      await replanAfterFetchEnd(client.id);
      return;
    }
    if (err instanceof SessionGoneError) {
      await documentFetchSessions.updateStatus(sessionId, 'expired', { error: 'browser session was lost' });
      await sendCanned(client, spec.messages.otpExpired);
      publishClientUpdated(client.id);
      await replanAfterFetchEnd(client.id);
      return;
    }
    logger.error('document fetch: otp verification failed', err, { sessionId, clientId: client.id });
    await fetchClient.close(sessionId);
    await documentFetchSessions.updateStatus(sessionId, 'failed', { error: errText(err) });
    recordDocumentFetchFailure(client, sessionId, 'otp', errText(err), row ? evidencePrefixFor(sessionId, row.created_at) : null);
    await sendCanned(client, spec.messages.loginFailed);
    publishClientUpdated(client.id);
    await replanAfterFetchEnd(client.id);
    return;
  }

  recordAudit({
    actorType: 'agent',
    action: 'document_fetch.otp_submitted',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'document_fetch_session',
    targetId: sessionId,
    detail: { clientName: client.name },
  });

  // Verified — download and deliver.
  try {
    const session = await documentFetchSessions.getById(sessionId);
    if (!session) return;
    await documentFetchSessions.updateStatus(sessionId, 'downloading');
    const docs = await fetchClient.downloadDocuments(sessionId, {
      taxYear: session.tax_year,
      documentKeys: session.document_keys ?? [],
    });
    await deliver(session, client, docs);
  } catch (err) {
    logger.error('document fetch: download/deliver failed', err, { sessionId, clientId: client.id });
    // The no-documents outcome is terminal knowledge, not a transient failure:
    // the login worked and the site answered with an empty list, so a retry
    // fails identically. Its error text (NO_DOCUMENTS_ERROR_PREFIX) drives the
    // failed_no_documents prompt state, and the client hears what actually
    // happened instead of "try again later".
    const noDocs = err instanceof NoDocumentsOnSiteError;
    await documentFetchSessions.updateStatus(sessionId, 'failed', { error: errText(err) });
    recordDocumentFetchFailure(client, sessionId, 'download', errText(err), row ? evidencePrefixFor(sessionId, row.created_at) : null);
    await sendCanned(client, noDocs ? spec.messages.noDocumentsOnSite : spec.messages.downloadFailed);
    publishClientUpdated(client.id);
    await replanAfterFetchEnd(client.id);
  } finally {
    // The runner closes after a download attempt on its own; this covers the
    // mock's bookkeeping and any path that bailed before downloading.
    await fetchClient.close(sessionId);
  }
}

async function runCancel(sessionId: string): Promise<void> {
  sessionTracker.discard(sessionId);
  await getFetchClient().close(sessionId);
  const session = await documentFetchSessions.getById(sessionId);
  if (session && documentFetchSessions.ACTIVE_DOCUMENT_FETCH_STATUSES.includes(session.status)) {
    await documentFetchSessions.updateStatus(sessionId, 'cancelled');
    publishClientUpdated(session.client_id);
  }
}

/** Registers the tracker's TTL-expiry callback: close the remote browser, mark expired + tell the client. */
export function wireSessionExpiry(): void {
  sessionTracker.setExpiryHandler((session) => {
    void (async () => {
      try {
        await getFetchClient().close(session.sessionId);
        logger.info('document fetch: session expired waiting for OTP', { sessionId: session.sessionId, clientId: session.clientId });
        const row = await documentFetchSessions.getById(session.sessionId);
        if (row && row.status === 'awaiting_otp') {
          await documentFetchSessions.updateStatus(session.sessionId, 'expired', { error: 'otp not received in time' });
        }
        const client = await clients.getById(session.clientId);
        if (client) {
          await sendCanned(client, getProviderSpec(session.provider).messages.otpExpired);
          publishClientUpdated(client.id);
          await replanAfterFetchEnd(client.id);
        }
      } catch (err) {
        logger.error('document fetch: expiry handling failed', err, { sessionId: session.sessionId });
      }
    })();
  });
}

/** Boot sweep: sessions still in a live-browser status had their tracking dropped by a restart. */
export async function expireOrphanedDocumentFetchSessions(): Promise<void> {
  const stale = await documentFetchSessions.listStaleLive();
  for (const row of stale) {
    await getFetchClient().close(row.id); // reap any browser the runner still holds
    await documentFetchSessions.updateStatus(row.id, 'expired', { error: 'worker restarted; browser session lost' });
    publishClientUpdated(row.client_id);
  }
  if (stale.length > 0) logger.info('document fetch: expired orphaned sessions on boot', { count: stale.length });
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** One audit row per failed fetch — the anomaly scanner counts these ('document_fetch.failed' spikes). */
function recordDocumentFetchFailure(
  client: ClientRow,
  sessionId: string,
  stage: string,
  error: string,
  /** Blob prefix of the session's step evidence (stepEvidence.ts), for the log reader. */
  evidencePrefix: string | null = null,
): void {
  recordAudit({
    actorType: 'agent',
    action: 'document_fetch.failed',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'document_fetch_session',
    targetId: sessionId,
    severity: 'warning',
    detail: { clientName: client.name, stage, error, ...(evidencePrefix ? { evidencePrefix } : {}) },
  });
}
