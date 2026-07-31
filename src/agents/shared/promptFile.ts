import { readFileSync } from 'node:fs';

/**
 * Loads an agent prompt template that lives as a plain .md file next to the
 * calling module (`loadPrompt(new URL('./prompt.md', import.meta.url))`).
 * Dev (tsx) resolves into src/; production resolves into dist/src, where the
 * build's copy step (scripts/copyPromptAssets.mjs) placed the .md files —
 * tsc itself does not copy non-TS assets.
 *
 * Read once at module load: a missing file should crash the process at boot,
 * not mid-conversation.
 */
export function loadPrompt(url: URL): string {
  return readFileSync(url, 'utf8').replace(/\r\n/g, '\n').trimEnd();
}

/**
 * Substitutes {{placeholder}} tokens. Unknown placeholders are left verbatim
 * so a typo is visible in the output instead of silently vanishing.
 */
export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, name: string) => (name in vars ? vars[name]! : match));
}
