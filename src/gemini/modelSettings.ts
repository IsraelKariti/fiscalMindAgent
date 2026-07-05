import * as appSettings from '../db/queries/appSettings.js';
import { env } from '../config/env.js';

export const GEMINI_MODEL_SETTING_KEY = 'gemini_model';

/**
 * Models the admin can pick from. Each id must exist in LiteLLM's pricing
 * registry as `gemini/<id>`, or cost tracking goes dark (see pricing.ts).
 */
export const GEMINI_MODEL_OPTIONS = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.1-pro-preview',
] as const;

export type GeminiModelOption = (typeof GEMINI_MODEL_OPTIONS)[number];

export interface GeminiModelState {
  model: string;
  /** True when the model comes from the admin-saved setting rather than the env default. */
  isCustom: boolean;
  updatedAt: Date | null;
}

function resolve(row: { value: string; updated_at: Date } | null): GeminiModelState {
  // A saved value that later dropped out of the options list falls back to the
  // env default instead of silently calling an unvetted model.
  if (row && (GEMINI_MODEL_OPTIONS as readonly string[]).includes(row.value)) {
    return { model: row.value, isCustom: true, updatedAt: row.updated_at };
  }
  return { model: env.GEMINI_MODEL, isCustom: false, updatedAt: null };
}

/**
 * The model every LLM call runs on, for every accountant and client: the
 * admin-saved setting, or the GEMINI_MODEL env default. Read from the DB per
 * call so the web and worker processes pick up a change without a restart.
 */
export async function getGeminiModel(): Promise<string> {
  return (await getGeminiModelState()).model;
}

export async function getGeminiModelState(): Promise<GeminiModelState> {
  return resolve(await appSettings.get(GEMINI_MODEL_SETTING_KEY));
}

export async function saveGeminiModel(model: GeminiModelOption): Promise<void> {
  await appSettings.upsert(GEMINI_MODEL_SETTING_KEY, model);
}
