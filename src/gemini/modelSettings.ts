import * as appSettings from '../db/queries/appSettings.js';
import { env } from '../config/env.js';
import {
  LLM_CALL_PURPOSES,
  LLM_MODEL_OPTIONS,
  backupConflict,
  providerForModel,
  type LlmCallPurpose,
  type LlmModelOption,
} from './modelCatalog.js';

// The static catalog itself is pure and lives in modelCatalog.ts (schemas and
// tests import it without dragging in env/DB); re-exported here so existing
// import sites keep working.
export { LLM_CALL_PURPOSES, LLM_MODEL_OPTIONS, backupConflict, providerForModel } from './modelCatalog.js';
export type { LlmCallPurpose, LlmModelOption, LlmProvider } from './modelCatalog.js';

export const GEMINI_MODEL_SETTING_KEY = 'gemini_model';

/** app_settings key of the per-call-site default (absent = the global model). */
export function purposeModelSettingKey(purpose: LlmCallPurpose): string {
  return `llm_model:${purpose}`;
}

/** app_settings key of the per-call-site backup model (absent = no backup). */
export function purposeBackupSettingKey(purpose: LlmCallPurpose): string {
  return `llm_backup_model:${purpose}`;
}

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
 * The model an LLM call runs on, for every accountant and client: the admin's
 * per-call-site default when `purpose` is given and one is set (and its
 * provider is still available), else the global admin-saved setting, else the
 * GEMINI_MODEL env default. Read from the DB per call so the web and worker
 * processes pick up a change without a restart.
 */
export async function getGeminiModel(purpose?: LlmCallPurpose): Promise<string> {
  if (purpose) {
    const override = await getPurposeModel(purpose);
    if (override) return override;
  }
  return (await getGeminiModelState()).model;
}

/** The admin's per-call-site default, or null when unset/unavailable (-> global model). */
export async function getPurposeModel(purpose: LlmCallPurpose): Promise<string | null> {
  const row = await appSettings.get(purposeModelSettingKey(purpose));
  return row && (availableModelOptions() as readonly string[]).includes(row.value) ? row.value : null;
}

export async function getPurposeModels(): Promise<Record<LlmCallPurpose, string | null>> {
  const entries = await Promise.all(LLM_CALL_PURPOSES.map(async (p) => [p, await getPurposeModel(p)] as const));
  return Object.fromEntries(entries) as Record<LlmCallPurpose, string | null>;
}

/** Pin (or with null, unpin) the default model of one call site. */
export async function savePurposeModel(purpose: LlmCallPurpose, model: LlmModelOption | null): Promise<void> {
  if (model === null) await appSettings.remove(purposeModelSettingKey(purpose));
  else await appSettings.upsert(purposeModelSettingKey(purpose), model);
}

/**
 * The admin's backup model of one call site, or null when unset or no longer
 * available (its provider's API key removed). Stored as saved: whether it
 * still sits on another provider than the primary is checked where it is
 * used (resolveBackupModel) and where it is saved (the admin routes).
 */
export async function getPurposeBackupModel(purpose: LlmCallPurpose): Promise<string | null> {
  const row = await appSettings.get(purposeBackupSettingKey(purpose));
  return row && (availableModelOptions() as readonly string[]).includes(row.value) ? row.value : null;
}

export async function getPurposeBackupModels(): Promise<Record<LlmCallPurpose, string | null>> {
  const entries = await Promise.all(LLM_CALL_PURPOSES.map(async (p) => [p, await getPurposeBackupModel(p)] as const));
  return Object.fromEntries(entries) as Record<LlmCallPurpose, string | null>;
}

/** Set (or with null, clear) the backup model of one call site. */
export async function savePurposeBackupModel(purpose: LlmCallPurpose, model: LlmModelOption | null): Promise<void> {
  if (model === null) await appSettings.remove(purposeBackupSettingKey(purpose));
  else await appSettings.upsert(purposeBackupSettingKey(purpose), model);
}

/**
 * The model a call of this purpose falls back to when `primaryModel` does
 * not answer (openspec `llm-model-settings`), or null when the stage has no
 * usable backup: none set, its provider unavailable, or — defensively, the
 * admin routes refuse such a pair — the same provider as the primary.
 */
export async function resolveBackupModel(purpose: LlmCallPurpose, primaryModel: string): Promise<string | null> {
  const backup = await getPurposeBackupModel(purpose);
  return backup && !backupConflict(primaryModel, backup) ? backup : null;
}

export async function getGeminiModelState(): Promise<GeminiModelState> {
  return resolve(await appSettings.get(GEMINI_MODEL_SETTING_KEY));
}

export async function saveGeminiModel(model: LlmModelOption): Promise<void> {
  await appSettings.upsert(GEMINI_MODEL_SETTING_KEY, model);
}
