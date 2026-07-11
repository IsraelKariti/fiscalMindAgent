import * as userSettings from '../db/queries/userSettings.js';
import { DEFAULT_PROMPT_TEMPLATE } from '../agents/docCollector/prompt.js';

export const PROMPT_TEMPLATE_SETTING_KEY = 'gemini_system_prompt_template';

export interface PromptTemplateState {
  template: string;
  isCustom: boolean;
  updatedAt: Date | null;
}

/**
 * The user's effective system-prompt template: their saved one, or the
 * built-in default. `userId` null (legacy CLI-created clients with no owner)
 * always resolves to the default.
 */
export async function getPromptTemplate(userId: string | null): Promise<PromptTemplateState> {
  const row = userId ? await userSettings.get(userId, PROMPT_TEMPLATE_SETTING_KEY) : null;
  if (!row) return { template: DEFAULT_PROMPT_TEMPLATE, isCustom: false, updatedAt: null };
  return { template: row.value, isCustom: true, updatedAt: row.updated_at };
}

export async function savePromptTemplate(userId: string, template: string): Promise<void> {
  await userSettings.upsert(userId, PROMPT_TEMPLATE_SETTING_KEY, template);
}

/** Reverts the user to the built-in default template. */
export async function resetPromptTemplate(userId: string): Promise<void> {
  await userSettings.remove(userId, PROMPT_TEMPLATE_SETTING_KEY);
}
