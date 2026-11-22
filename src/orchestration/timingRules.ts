/**
 * The message timing values the admin can set (openspec `admin-timing-settings`):
 * pure resolution and validation, free of env and DB so tests import it alone.
 * The DB-aware reader/writer is timingSettings.ts.
 */

export interface MessageTiming {
  /** Quiet window after the client's last inbound before the planner runs. */
  quietSeconds: number;
  /** Upper bound of a turn's wait, counted from its first inbound. */
  maxWaitSeconds: number;
  /** Wait after the agent's own delivered message before the next plan (0 = at once). */
  afterSendDelaySeconds: number;
}

export type MessageTimingKey = keyof MessageTiming;

export const MESSAGE_TIMING_KEYS: readonly MessageTimingKey[] = ['quietSeconds', 'maxWaitSeconds', 'afterSendDelaySeconds'];

/** app_settings key per value. */
export const MESSAGE_TIMING_SETTING_KEYS: Record<MessageTimingKey, string> = {
  quietSeconds: 'message_timing:quiet_seconds',
  maxWaitSeconds: 'message_timing:max_wait_seconds',
  afterSendDelaySeconds: 'message_timing:after_send_delay_seconds',
};

/** The smallest value each setting accepts. */
export const MESSAGE_TIMING_MIN: Record<MessageTimingKey, number> = {
  quietSeconds: 1,
  maxWaitSeconds: 1,
  afterSendDelaySeconds: 0,
};

/** A saved row's text as a whole number of seconds, or null when it is missing or unusable. */
export function parseSavedSeconds(value: string | null | undefined, key: MessageTimingKey): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= MESSAGE_TIMING_MIN[key] ? n : null;
}

/**
 * The effective timing: each saved value when usable, else the server
 * default (env variable, else the code default). Values are resolved one by
 * one so a single bad row does not drop the others.
 */
export function resolveMessageTiming(
  saved: Partial<Record<MessageTimingKey, string | null | undefined>>,
  defaults: MessageTiming,
): MessageTiming {
  const pick = (key: MessageTimingKey): number => parseSavedSeconds(saved[key], key) ?? defaults[key];
  return {
    quietSeconds: pick('quietSeconds'),
    maxWaitSeconds: pick('maxWaitSeconds'),
    afterSendDelaySeconds: pick('afterSendDelaySeconds'),
  };
}

/** A refused save; the message is plain enough for the settings page. */
export class MessageTimingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MessageTimingError';
  }
}

/** Throws a MessageTimingError when `next` breaks a per-value or cross-value rule. */
export function validateMessageTiming(next: MessageTiming): void {
  for (const key of MESSAGE_TIMING_KEYS) {
    const value = next[key];
    if (!Number.isInteger(value)) throw new MessageTimingError('Every value must be a whole number of seconds.');
    if (value < MESSAGE_TIMING_MIN[key]) {
      throw new MessageTimingError(
        key === 'afterSendDelaySeconds'
          ? 'The delay after a sent message cannot be negative.'
          : `The ${key === 'quietSeconds' ? 'quiet window' : 'maximum wait'} must be at least 1 second.`,
      );
    }
  }
  if (next.maxWaitSeconds < next.quietSeconds) {
    throw new MessageTimingError('The maximum wait must be at least the quiet window.');
  }
}
