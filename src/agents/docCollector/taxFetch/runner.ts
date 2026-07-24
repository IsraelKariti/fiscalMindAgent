import * as clientPortalCredentials from '../../../db/queries/clientPortalCredentials.js';
import * as clients from '../../../db/queries/clients.js';
import * as emails from '../../../db/queries/emails.js';
import * as taxFetchSessions from '../../../db/queries/taxFetchSessions.js';
import * as waSenders from '../../../db/queries/waSenders.js';
import { publishClientUpdated } from '../../../events/clientEvents.js';
import { getFetchClient } from './fetchClient.js';
import { FetchAtCapacityError, OtpRejectedError, SessionGoneError } from './types.js';
import { sessionTracker } from './sessionTracker.js';
import { sendWhatsAppTextAndRecord } from '../../../twilio/sendAndRecord.js';
import { logger } from '../../../util/logger.js';
import type { ClientRow } from '../../../db/types.js';
import { enqueueTaxFetch, type TaxFetchJob } from '../../../queue/taxFetchQueue.js';
import { deliver } from './deliver.js';

const MAX_OTP_ATTEMPTS = 3;
const PROVIDER_ID = 'israel_tax_authority';

// The heads-up message may still be a queued draft when the delayed start_login
// job fires; re-check on this cadence before giving up (an abandoned draft —
// superseded by a client reply — never sends, so the login must never run).
const START_WAIT_RETRY_MS = 10_000;
const MAX_START_WAIT_ATTEMPTS = 6;

// Canned Hebrew progress lines the system sends directly (no LLM) as the fetch moves.
const MSG = {
  loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר רשות המסים כרגע. נוכל לנסות שוב מאוחר יותר.',
  busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
  otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
  otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת ב-SMS.',
  otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
  downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הטופס כרגע. נוכל לנסות שוב מאוחר יותר.',
};

/** Sends a canned WhatsApp line to the client; never throws (progress messaging is best-effort). */
async function sendCanned(client: ClientRow, body: string): Promise<void> {
  try {
    const sender = client.agent_instance_id ? await waSenders.getByInstanceId(client.agent_instance_id) : null;
    if (!sender || !client.wa_phone) {
      logger.warn('tax fetch: client not whatsapp-reachable, skipping progress message', { clientId: client.id });
      return;
    }
    await sendWhatsAppTextAndRecord(client.id, {
      from: sender.phone_number,
      to: client.wa_phone,
      body,
      reasoning: 'tax fetch progress',
    });
  } catch (err) {
    logger.error('tax fetch: progress message send failed', err, { clientId: client.id });
  }
}

export async function runTaxFetchJob(job: TaxFetchJob): Promise<void> {
  switch (job.kind) {
    case 'start_login':
      return runStartLogin(job);
    case 'submit_otp':
      return runSubmitOtp(job.sessionId, job.otp);
    case 'cancel':
      return runCancel(job.sessionId);
  }
}

async function runStartLogin(job: Extract<TaxFetchJob, { kind: 'start_login' }>): Promise<void> {
  const { sessionId } = job;
  const session = await taxFetchSessions.getById(sessionId);
  if (!session) return;
  // The job runs delayed; the session may have been cancelled (or already
  // started) while it waited — only the pre-login statuses may proceed.
  if (session.status !== 'agreed' && session.status !== 'wa_intro_sent') {
    logger.info('tax fetch: start_login skipped, session no longer pre-login', { sessionId, status: session.status });
    return;
  }
  const client = await clients.getById(session.client_id);
  if (!client) return;

  // The login triggers the real OTP SMS — it may only run after the message
  // telling the client to expect the code has actually been sent.
  if (job.awaitEmailId) {
    const headsUp = await emails.getById(job.awaitEmailId);
    if (!headsUp) {
      logger.warn('tax fetch: heads-up message row missing, not starting login', { sessionId, emailId: job.awaitEmailId });
      return; // session stays pre-login; a later re-plan can start again
    }
    if (headsUp.status !== 'sent') {
      const attempt = job.awaitAttempt ?? 0;
      if (attempt >= MAX_START_WAIT_ATTEMPTS) {
        // Superseded or failed draft — it will never send. Leave the session
        // pre-login; the next client reply re-plans and can start afresh.
        logger.warn('tax fetch: heads-up message never sent, giving up on this start_login', {
          sessionId,
          emailId: job.awaitEmailId,
          status: headsUp.status,
        });
        return;
      }
      await enqueueTaxFetch({ ...job, awaitAttempt: attempt + 1 }, { delayMs: START_WAIT_RETRY_MS });
      return;
    }
  }

  const creds = await clientPortalCredentials.getForClient(session.client_id, PROVIDER_ID);
  if (!creds) {
    await taxFetchSessions.updateStatus(sessionId, 'failed', { error: 'no portal credentials on file' });
    await sendCanned(client, MSG.loginFailed);
    publishClientUpdated(client.id);
    return;
  }

  // Each live session is a real browser on the runner; refuse rather than pile up.
  if (sessionTracker.atCapacity()) {
    await sendCanned(client, MSG.busy);
    logger.warn('tax fetch: at session capacity, deferring', { sessionId });
    return; // stays 'agreed'/'wa_intro_sent'; the client can trigger again
  }

  await taxFetchSessions.updateStatus(sessionId, 'logging_in');
  const fetchClient = getFetchClient();
  try {
    await fetchClient.startLogin(sessionId, PROVIDER_ID, { idNumber: creds.id_number, userCode: creds.user_code });
    sessionTracker.put({ sessionId, clientId: client.id, provider: PROVIDER_ID });
    // No canned "code incoming" line here: the LLM's heads-up message (verified
    // sent above) already told the client an SMS is coming and where to send it.
    await taxFetchSessions.updateStatus(sessionId, 'awaiting_otp', { otpRequestedAt: new Date() });
    publishClientUpdated(client.id);
  } catch (err) {
    if (err instanceof FetchAtCapacityError) {
      // The runner is serving other fetches; same deferral as the local check.
      await taxFetchSessions.updateStatus(sessionId, session.status);
      await sendCanned(client, MSG.busy);
      logger.warn('tax fetch: runner at capacity, deferring', { sessionId });
      return;
    }
    logger.error('tax fetch: login failed', err, { sessionId, clientId: client.id });
    sessionTracker.discard(sessionId);
    await fetchClient.close(sessionId);
    await taxFetchSessions.updateStatus(sessionId, 'failed', { error: errText(err) });
    await sendCanned(client, MSG.loginFailed);
    publishClientUpdated(client.id);
  }
}

async function runSubmitOtp(sessionId: string, otp: string): Promise<void> {
  const fetchClient = getFetchClient();
  const live = sessionTracker.take(sessionId);
  if (!live) {
    // The session is gone (TTL expired or worker restarted). Reap any remote
    // browser, move the row on and tell the client.
    await fetchClient.close(sessionId);
    const session = await taxFetchSessions.getById(sessionId);
    if (session && session.status === 'awaiting_otp') {
      await taxFetchSessions.updateStatus(sessionId, 'expired', { error: 'otp submitted after session was lost' });
      const client = await clients.getById(session.client_id);
      if (client) {
        await sendCanned(client, MSG.otpExpired);
        publishClientUpdated(client.id);
      }
    }
    return;
  }

  const client = await clients.getById(live.clientId);
  if (!client) {
    await fetchClient.close(sessionId);
    return;
  }

  try {
    await taxFetchSessions.updateStatus(sessionId, 'verifying');
    await fetchClient.submitOtp(sessionId, otp);
  } catch (err) {
    if (err instanceof OtpRejectedError) {
      const attempts = await taxFetchSessions.incrementOtpAttempts(sessionId);
      if (attempts < MAX_OTP_ATTEMPTS) {
        // The runner kept the page on the OTP screen; re-arm the wait for another code.
        sessionTracker.put({ sessionId, clientId: client.id, provider: PROVIDER_ID });
        await taxFetchSessions.updateStatus(sessionId, 'awaiting_otp');
        await sendCanned(client, MSG.otpRejected);
        publishClientUpdated(client.id);
        return;
      }
      await fetchClient.close(sessionId);
      await taxFetchSessions.updateStatus(sessionId, 'failed', { error: 'otp rejected too many times' });
      await sendCanned(client, MSG.otpGaveUp);
      publishClientUpdated(client.id);
      return;
    }
    if (err instanceof SessionGoneError) {
      await taxFetchSessions.updateStatus(sessionId, 'expired', { error: 'browser session was lost' });
      await sendCanned(client, MSG.otpExpired);
      publishClientUpdated(client.id);
      return;
    }
    logger.error('tax fetch: otp verification failed', err, { sessionId, clientId: client.id });
    await fetchClient.close(sessionId);
    await taxFetchSessions.updateStatus(sessionId, 'failed', { error: errText(err) });
    await sendCanned(client, MSG.loginFailed);
    publishClientUpdated(client.id);
    return;
  }

  // Verified — download and deliver.
  try {
    const session = await taxFetchSessions.getById(sessionId);
    if (!session) return;
    await taxFetchSessions.updateStatus(sessionId, 'downloading');
    const doc = await fetchClient.downloadDocument(sessionId, { taxYear: session.tax_year });
    await deliver(session, client, doc);
  } catch (err) {
    logger.error('tax fetch: download/deliver failed', err, { sessionId, clientId: client.id });
    await taxFetchSessions.updateStatus(sessionId, 'failed', { error: errText(err) });
    await sendCanned(client, MSG.downloadFailed);
    publishClientUpdated(client.id);
  } finally {
    // The runner closes after a download attempt on its own; this covers the
    // mock's bookkeeping and any path that bailed before downloading.
    await fetchClient.close(sessionId);
  }
}

async function runCancel(sessionId: string): Promise<void> {
  sessionTracker.discard(sessionId);
  await getFetchClient().close(sessionId);
  const session = await taxFetchSessions.getById(sessionId);
  if (session && taxFetchSessions.ACTIVE_TAX_FETCH_STATUSES.includes(session.status)) {
    await taxFetchSessions.updateStatus(sessionId, 'cancelled');
    publishClientUpdated(session.client_id);
  }
}

/** Registers the tracker's TTL-expiry callback: close the remote browser, mark expired + tell the client. */
export function wireSessionExpiry(): void {
  sessionTracker.setExpiryHandler((session) => {
    void (async () => {
      try {
        await getFetchClient().close(session.sessionId);
        logger.info('tax fetch: session expired waiting for OTP', { sessionId: session.sessionId, clientId: session.clientId });
        const row = await taxFetchSessions.getById(session.sessionId);
        if (row && row.status === 'awaiting_otp') {
          await taxFetchSessions.updateStatus(session.sessionId, 'expired', { error: 'otp not received in time' });
        }
        const client = await clients.getById(session.clientId);
        if (client) {
          await sendCanned(client, MSG.otpExpired);
          publishClientUpdated(client.id);
        }
      } catch (err) {
        logger.error('tax fetch: expiry handling failed', err, { sessionId: session.sessionId });
      }
    })();
  });
}

/** Boot sweep: sessions still in a live-browser status had their tracking dropped by a restart. */
export async function expireOrphanedTaxFetchSessions(): Promise<void> {
  const stale = await taxFetchSessions.listStaleLive();
  for (const row of stale) {
    await getFetchClient().close(row.id); // reap any browser the runner still holds
    await taxFetchSessions.updateStatus(row.id, 'expired', { error: 'worker restarted; browser session lost' });
    publishClientUpdated(row.client_id);
  }
  if (stale.length > 0) logger.info('tax fetch: expired orphaned sessions on boot', { count: stale.length });
}

function errText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
