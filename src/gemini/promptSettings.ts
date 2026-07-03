import * as appSettings from '../db/queries/appSettings.js';
import { DEFAULT_PROMPT_TEMPLATE } from './prompt.js';

export const PROMPT_TEMPLATE_SETTING_KEY = 'gemini_system_prompt_template';

export interface PromptTemplateState {
  template: string;
  isCustom: boolean;
  updatedAt: Date | null;
}

/** The effective system-prompt template: the dashboard-saved one, or the built-in default. */
export async function getPromptTemplate(): Promise<PromptTemplateState> {
  const row = await appSettings.get(PROMPT_TEMPLATE_SETTING_KEY);
  if (!row) return { template: DEFAULT_PROMPT_TEMPLATE, isCustom: false, updatedAt: null };
  return { template: row.value, isCustom: true, updatedAt: row.updated_at };
}

export async function savePromptTemplate(template: string): Promise<void> {
  await appSettings.upsert(PROMPT_TEMPLATE_SETTING_KEY, template);
}

/** Reverts to the built-in default template. */
export async function resetPromptTemplate(): Promise<void> {
  await appSettings.remove(PROMPT_TEMPLATE_SETTING_KEY);
}
