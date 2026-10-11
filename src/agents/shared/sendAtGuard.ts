import { hoursToMs, zonedTimeToUtc } from '../../util/time.js';
import { chagLabel } from './jewishHolidays.js';

/**
 * The planner's "send this as soon as you can" answer (openspec
 * `reply-send-asap`): the model names no time; the code picks one.
 */
export const ASAP_SEND_AT = 'asap';

/** How far ahead the code places an asap send — keeps the planned time in the future for the timeline and the review flow. */
const ASAP_LEAD_MS = 1000;

export type ResolvedSendAt = {
  /** The instant the send job fires. */
  sendAtUtc: Date;
  /** The same instant as wall-clock text in `timeZone` ("YYYY-MM-DD HH:MM" from the model, "YYYY-MM-DD HH:MM:SS" when the code picked it). */
  sendAtLocal: string;
  /** Who chose the time. */
  requested: 'asap' | 'time';
};

/** The instant as "YYYY-MM-DD HH:MM:SS" wall-clock text in `timeZone`. */
function wallClockLabel(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

/**
 * Turns the planner's send_at into the instant the send job fires. For
 * ASAP_SEND_AT the code picks the time itself — `now` plus one second — and
 * from there the draft is scheduled exactly like one with a model-chosen
 * time. A wall-clock time is converted in the accountant's timezone as
 * before (an unparseable value still throws from zonedTimeToUtc).
 */
export function resolveSendAt(sendAt: string, now: Date, timeZone: string): ResolvedSendAt {
  if (sendAt.trim().toLowerCase() === ASAP_SEND_AT) {
    const sendAtUtc = new Date(now.getTime() + ASAP_LEAD_MS);
    return { sendAtUtc, sendAtLocal: wallClockLabel(sendAtUtc, timeZone), requested: 'asap' };
  }
  return { sendAtUtc: zonedTimeToUtc(sendAt, timeZone), sendAtLocal: sendAt, requested: 'time' };
}

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
