import * as appSettings from '../db/queries/appSettings.js';
import { env } from '../config/env.js';
import {
  MESSAGE_TIMING_KEYS,
  MESSAGE_TIMING_SETTING_KEYS,
  resolveMessageTiming,
  validateMessageTiming,
  type MessageTiming,
} from './timingRules.js';

export { MessageTimingError, type MessageTiming } from './timingRules.js';

/** The server defaults: the env variables (openspec `admin-timing-settings`), themselves defaulted in env.ts. */
export function messageTimingDefaults(): MessageTiming {
  return {
    quietSeconds: env.INBOUND_QUIET_SECONDS,
    maxWaitSeconds: env.INBOUND_MAX_WAIT_SECONDS,
    afterSendDelaySeconds: env.AFTER_SEND_PLAN_DELAY_SECONDS,
  };
}

/**
 * The effective message timing: the admin-saved values, each falling back to
 * the server default. Read from the DB per decision so the web and worker
 * processes pick up a change without a restart.
 */
export async function getMessageTiming(): Promise<MessageTiming> {
  const rows = await Promise.all(MESSAGE_TIMING_KEYS.map((key) => appSettings.get(MESSAGE_TIMING_SETTING_KEYS[key])));
  const saved = Object.fromEntries(MESSAGE_TIMING_KEYS.map((key, i) => [key, rows[i]?.value ?? null]));
  return resolveMessageTiming(saved, messageTimingDefaults());
}

/** Validates (throws MessageTimingError) and saves all three values. */
export async function saveMessageTiming(next: MessageTiming): Promise<void> {
  validateMessageTiming(next);
  for (const key of MESSAGE_TIMING_KEYS) await appSettings.upsert(MESSAGE_TIMING_SETTING_KEYS[key], String(next[key]));
}
