/**
 * The call link: every LLM call has its own address,
 * `<origin>/#/llm-calls/<llm_calls row id>` — the admin call browser's
 * drill-down address, which App also opens while impersonating. Independent
 * of client / agent / accountant. Pure (no React, no window) so it is
 * unit-tested from the root test suite; callers pass `window.location.origin`.
 * Mirrors stepLink.ts.
 */

import { fullPriceInputTokens } from './tokens.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function callLinkOf(callId: string, origin: string): string {
  return `${origin}/#/llm-calls/${encodeURIComponent(callId)}`;
}

/**
 * True when the hash names one call (`#/llm-calls/<something>`). The bare
 * `#/llm-calls` is the admin call browser, not a call link: while
 * impersonating there is no browser to show, so it must fall through.
 */
export function isCallHash(hash: string): boolean {
  return /^#\/llm-calls\/./.test(hash);
}

/** The call id of a `#/llm-calls/<uuid>` hash (trailing slash tolerated), or null for any other or malformed hash. */
export function parseCallHash(hash: string): string | null {
  const match = /^#\/llm-calls\/([^/]+)\/?$/.exec(hash);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]!);
  } catch {
    // A stray "%" makes decodeURIComponent throw.
    return null;
  }
  return UUID.test(id) ? id : null;
}

/**
 * What "copy details" puts on the clipboard: the link on the first line, then
 * the whole call as formatted JSON — every field the modal holds (metadata,
 * the exact request, the raw response), nothing picked or dropped.
 * Self-contained on purpose — the reader (Claude, given a call from
 * production) may have no access to the site or its database.
 * One field is added: `fullPriceInputTokens`, right after the stored
 * `inputTokens` total, so the reader sees how many tokens the input price
 * applied to (openspec `llm-call-cache-usage`).
 */
export function callDetailsText(call: { id: string }, origin: string): string {
  return `${callLinkOf(call.id, origin)}\n\n${JSON.stringify(withFullPriceInput(call), null, 2)}`;
}

/** The call with `fullPriceInputTokens` after `inputTokens`; unchanged when it carries no token counts. */
function withFullPriceInput(call: { id: string }): Record<string, unknown> {
  const fields = call as Record<string, unknown>;
  const { inputTokens, cachedTokens, cacheWriteTokens } = fields;
  if (typeof inputTokens !== 'number' || typeof cachedTokens !== 'number') return fields;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] = value;
    if (key === 'inputTokens') {
      out.fullPriceInputTokens = fullPriceInputTokens({ inputTokens, cachedTokens, cacheWriteTokens: typeof cacheWriteTokens === 'number' ? cacheWriteTokens : 0 });
    }
  }
  return out;
}

/** The names behind a call's ids, as the single-call endpoint serves them: the client's checklist items and received files. */
export interface CallNames {
  documents: Record<string, string>;
  files: Record<string, string>;
}

/**
 * A tool call's arguments with the names beside the ids (openspec
 * `conversation-trace`): every top-level `*_id` key whose value is a known
 * document or file id gains a `*_name` key right after it, every `*_ids` list
 * gains `*_names` (an unknown id keeps its id so positions match). Ids are
 * never removed, renamed or rewritten; an unknown id (a message id, a deleted
 * file) gains nothing. Pure, so it is unit-tested from the root suite.
 */
export function withNamedIds(args: unknown, names: CallNames | undefined): unknown {
  if (!names || typeof args !== 'object' || args === null || Array.isArray(args)) return args;
  const nameOf = (id: unknown): string | null =>
    typeof id === 'string' ? (names.documents[id] ?? names.files[id] ?? null) : null;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args as Record<string, unknown>)) {
    out[key] = value;
    if (key.endsWith('_id')) {
      const name = nameOf(value);
      if (name !== null) out[`${key.slice(0, -3)}_name`] = name;
    } else if (key.endsWith('_ids') && Array.isArray(value) && value.some((id) => nameOf(id) !== null)) {
      out[`${key.slice(0, -4)}_names`] = value.map((id) => nameOf(id) ?? id);
    }
  }
  return out;
}
