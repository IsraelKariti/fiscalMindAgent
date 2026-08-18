import { loadPrompt } from '../shared/promptFile.js';

/**
 * The declaration-of-capital collector's system-prompt template. Same
 * placeholders as the doc collector's (PROMPT_PLACEHOLDERS in
 * docCollector/prompt.ts — {{tax_year}} here is the year of the declaration's
 * 31.12 valuation date). Unlike the doc collector, this template is not
 * accountant-editable: the prompt-editor's legacy setting key applies to the
 * doc collector only (per-agent template keys are deferred work).
 */
export const DECLARATION_OF_CAPITAL_PROMPT_TEMPLATE = loadPrompt(new URL('./prompt.md', import.meta.url));
