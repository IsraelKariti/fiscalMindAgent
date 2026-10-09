/**
 * The call link: every LLM call has its own address,
 * `<origin>/#/llm-calls/<llm_calls row id>` — the admin call browser's
 * drill-down address, which App also opens while impersonating. Independent
 * of client / agent / accountant. Pure (no React, no window) so it is
 * unit-tested from the root test suite; callers pass `window.location.origin`.
 * Mirrors stepLink.ts.
 */

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
 */
export function callDetailsText(call: { id: string }, origin: string): string {
  return `${callLinkOf(call.id, origin)}\n\n${JSON.stringify(call, null, 2)}`;
}
