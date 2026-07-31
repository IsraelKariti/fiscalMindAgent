import { hoursToMs } from '../../util/time.js';

/** Israel's weekend, in JS Date.getUTCDay() terms. */
const FRIDAY = 5;
const SATURDAY = 6;

/**
 * A client who wrote within this window is an active conversation: the message
 * being scheduled is a reply, and replies may go out any day (mirrors the
 * prompt's momentum rule). Beyond it the message is a proactive interruption.
 */
const ACTIVE_CONVERSATION_MS = hoursToMs(24);

/** "YYYY-MM-DD" date part + the untouched time part (space or T separator). */
const LOCAL_SEND_AT_RE = /^(\d{4})-(\d{2})-(\d{2})([ T]\d{2}:\d{2}(?::\d{2})?)$/;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Code-level enforcement of the prompts' weekend rule: proactive messages
 * never send on the Israeli weekend. The prompt states it too, but an LLM
 * instruction is not enforcement (a live first email was scheduled on a
 * Friday despite it) — this clamp is the guarantee, like the 24h-window check.
 *
 * `sendAt` is the LLM's wall-clock datetime in the accountant's timezone;
 * when it lands on Friday/Saturday and the client has been silent for over
 * 24h, it is rolled forward to Sunday at the same wall-clock time. Replies in
 * an active conversation pass through untouched, as does anything unparseable
 * (zonedTimeToUtc raises the error where it always has).
 */
export function rollWeekendSendAt(
  sendAt: string,
  lastInboundAt: Date | null,
  now: Date,
): { sendAt: string; rolled: boolean } {
  if (lastInboundAt && now.getTime() - lastInboundAt.getTime() <= ACTIVE_CONVERSATION_MS) {
    return { sendAt, rolled: false };
  }
  const m = LOCAL_SEND_AT_RE.exec(sendAt.trim());
  if (!m) return { sendAt, rolled: false };
  const [, y, mo, d, time] = m;
  const dateUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const weekday = new Date(dateUtc).getUTCDay();
  if (weekday !== FRIDAY && weekday !== SATURDAY) return { sendAt, rolled: false };
  const sunday = new Date(dateUtc + (7 - weekday) * 86_400_000);
  return {
    sendAt: `${sunday.getUTCFullYear()}-${pad(sunday.getUTCMonth() + 1)}-${pad(sunday.getUTCDate())}${time}`,
    rolled: true,
  };
}

/** The client's most recent inbound message time (any channel), for the active-conversation test. */
export function lastInboundMessageAt(history: { direction: string; sent_at: Date | null; created_at: Date }[]): Date | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i]!;
    if (message.direction === 'inbound') return message.sent_at ?? message.created_at;
  }
  return null;
}
