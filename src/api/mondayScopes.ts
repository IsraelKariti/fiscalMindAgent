/**
 * The monday OAuth scopes the agents need (openspec `monday-connection`).
 * Each scope must also be enabled on the monday app in the Developer Center.
 *
 * - boards:read / docs:read — client-import sources and the kickoff webhook.
 * - boards:write — the board status sync (src/agents/shared/mondayStatusSync.ts).
 * - users:read — resolves a people cell (the tax advisor, openspec
 *   `client-tax-advisor`) to a name + email.
 *
 * Adding a scope: append it here and enable it in the Developer Center. The
 * Settings page then shows every accountant whose stored token lacks it an
 * "Update monday permissions" notice (`missingMondayScopes`), so nobody has to
 * be told to reconnect by hand.
 */
export const MONDAY_OAUTH_SCOPES = 'boards:read boards:write docs:read users:read';

/** Space- or comma-separated scope string → trimmed, lowercased scope names. */
function parseScopes(scopes: string): string[] {
  return scopes
    .split(/[\s,]+/)
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);
}

export function requestedMondayScopes(): string[] {
  return parseScopes(MONDAY_OAUTH_SCOPES);
}

/**
 * Requested scopes the stored token was not granted. Order-insensitive, so a
 * token monday reports with the same scopes in another order is never flagged.
 * No stored token (not connected) → nothing missing; that state is reported
 * separately.
 */
export function missingMondayScopes(stored: string | null | undefined): string[] {
  if (stored == null) return [];
  const have = new Set(parseScopes(stored));
  return requestedMondayScopes().filter((scope) => !have.has(scope));
}
