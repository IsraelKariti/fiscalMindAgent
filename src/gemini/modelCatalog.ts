/**
 * The static model catalog — pure (no env/DB imports) so config schemas and
 * tests can use it; availability filtering (API keys) lives in
 * modelSettings.ts, which re-exports everything here.
 */

/**
 * Models the admin can pick from. Each id must exist in LiteLLM's pricing
 * registry — as `gemini/<id>` for Gemini models, bare `<id>` for OpenAI and
 * Anthropic — or cost tracking goes dark (see pricing.ts).
 */
export const LLM_MODEL_OPTIONS = [
  'gemini-2.5-flash',
  'gemini-3-flash-preview',
  'gemini-3.5-flash',
  'gemini-3.7-flash',
  'gemini-3.1-pro-preview',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'claude-opus-5',
  'claude-sonnet-5',
  'claude-haiku-4-5',
] as const;

export type LlmModelOption = (typeof LLM_MODEL_OPTIONS)[number];

export type LlmProvider = 'gemini' | 'openai' | 'anthropic';

/** Which API a model id is served by (generate.ts routes on this). */
export function providerForModel(model: string): LlmProvider {
  if (model.startsWith('gpt-')) return 'openai';
  if (model.startsWith('claude-')) return 'anthropic';
  return 'gemini';
}

/**
 * The pipeline's LLM call sites, by their llm_calls.purpose value. The admin
 * can pin a default model to each (modelSettings.ts).
 */
export const LLM_CALL_PURPOSES = [
  'conversation_decide',
  'form_intake',
  'injection_screen',
  'analyze_file',
  'verify_document',
] as const;
export type LlmCallPurpose = (typeof LLM_CALL_PURPOSES)[number];
