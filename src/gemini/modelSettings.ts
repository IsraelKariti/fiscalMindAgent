import * as appSettings from '../db/queries/appSettings.js';
import { env } from '../config/env.js';
import { LLM_MODEL_OPTIONS, providerForModel, type LlmModelOption } from './modelCatalog.js';

// The static catalog itself is pure and lives in modelCatalog.ts (schemas and
// tests import it without dragging in env/DB); re-exported here so existing
// import sites keep working.
export { LLM_MODEL_OPTIONS, providerForModel } from './modelCatalog.js';
export type { LlmModelOption, LlmProvider } from './modelCatalog.js';

export const GEMINI_MODEL_SETTING_KEY = 'gemini_model';

/**
 * The options actually selectable right now: OpenAI/Anthropic models only
 * appear once their API key is set, so the admin can never route every agent
 * onto a provider the deployment cannot call.
 */
export function availableModelOptions(): readonly LlmModelOption[] {
  return LLM_MODEL_OPTIONS.filter((m) => {
    const provider = providerForModel(m);
    if (provider === 'openai') return Boolean(env.OPENAI_API_KEY);
    if (provider === 'anthropic') return Boolean(env.ANTHROPIC_API_KEY);
    return true;
  });
}

export interface GeminiModelState {
  model: string;
  /** True when the model comes from the admin-saved setting rather than the env default. */
  isCustom: boolean;
  updatedAt: Date | null;
}

function resolve(row: { value: string; updated_at: Date } | null): GeminiModelState {
  // A saved value that later dropped out of the options list (or became
  // unavailable, e.g. a GPT model after OPENAI_API_KEY was removed) falls back
  // to the env default instead of silently calling an unreachable model.
  if (row && (availableModelOptions() as readonly string[]).includes(row.value)) {
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

export async function saveGeminiModel(model: LlmModelOption): Promise<void> {
  await appSettings.upsert(GEMINI_MODEL_SETTING_KEY, model);
}
