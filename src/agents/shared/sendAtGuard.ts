import { hoursToMs } from '../../util/time.js';
import { chagLabel } from './jewishHolidays.js';

/** Israel's weekend, in JS Date.getUTCDay() terms. */
const FRIDAY = 5;
const SATURDAY = 6;

const DAY_MS = 86_400_000;

/**
 * A client who wrote within this window is an active conversation: the message
 * being scheduled is a reply, and replies may go out any day (mirrors the
 * prompt's momentum rule). Beyond it the message is a proactive interruption.
 */
const ACTIVE_CONVERSATION_MS = hoursToMs(24);

/** "YYYY-MM-DD" date part + the untouched time part (space or T separator). */
const LOCAL_SEND_AT_RE = /^(\d{4})-(\d{2})-(\d{2})([ T]\d{2}:\d{2}(?::\d{2})?)$/;

const pad = (n: number) => String(n).padStart(2, '0');

const isoFromUtcMs = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** Fri/Sat, chag, or erev chag — no proactive sends on any of them. */
function isBlockedDay(dayUtcMs: number): boolean {
  const weekday = new Date(dayUtcMs).getUTCDay();
  if (weekday === FRIDAY || weekday === SATURDAY) return true;
  return chagLabel(isoFromUtcMs(dayUtcMs)) !== null;
}

/**
 * Code-level enforcement of the prompts' calendar rule: proactive messages
 * never send on the Israeli weekend, on a chag, or on erev chag. The prompt
 * states it too, but an LLM instruction is not enforcement (a live first email
 * was scheduled on a Friday despite it) — this clamp is the guarantee, like
 * the 24h-window check.
 *
 * `sendAt` is the LLM's wall-clock datetime in the accountant's timezone;
 * when it lands on a blocked day and the client has been silent for over 24h,
 * it is rolled forward day by day to the first allowed day at the same
 * wall-clock time (a Rosh Hashana that touches a weekend rolls past the whole
 * stretch). Replies in an active conversation pass through untouched, as does
 * anything unparseable (zonedTimeToUtc raises the error where it always has).
 */
export function rollBlockedSendAt(
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
  let dayUtc = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  let steps = 0;
  // The longest real blocked stretch is ~4 days (erev + two-day Rosh Hashana
  // meeting a weekend); 14 is a safety cap, not a bound anyone should hit.
  while (steps < 14 && isBlockedDay(dayUtc)) {
    dayUtc += DAY_MS;
    steps++;
  }
  if (steps === 0) return { sendAt, rolled: false };
  return { sendAt: `${isoFromUtcMs(dayUtc)}${time}`, rolled: true };
}

/** The client's most recent inbound message time (any channel), for the active-conversation test. */
export function lastInboundMessageAt(history: { direction: string; sent_at: Date | null; created_at: Date }[]): Date | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const message = history[i]!;
    if (message.direction === 'inbound') return message.sent_at ?? message.created_at;
  }
  return null;
}
