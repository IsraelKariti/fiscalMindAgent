/**
 * The Twilio friendly name of an owned number is the ownership record shared
 * by every environment on the same Twilio account (prod, sandbox, dev each
 * have their own database, so the name is the only place all of them read).
 *
 *   `fiscalmind <agentInstanceId> <agentType>` — used by that agent instance
 *   `fiscalmind pool`                          — free, nobody uses it
 *   anything else (the phone number, console text) — no record; treated as free
 *
 * Twilio cuts friendly names at 64 characters. The id goes first so it is
 * never cut; the type (display only) may be. Labels written before this
 * order existed (`fiscalmind <agentType> <id>`) arrive with a cut id, so the
 * parser accepts a UUID prefix and callers look the instance up by prefix.
 *
 * Set on purchase and on assignment, reset on unassignment (provision.ts).
 */

const PREFIX = 'fiscalmind';
export const POOL_LABEL = `${PREFIX} pool`;
const TWILIO_FRIENDLY_NAME_MAX = 64;

export interface NumberOwner {
  /** Possibly cut short (a UUID prefix of at least 8 hex characters). */
  instanceId: string;
  /** May be cut short or empty. */
  agentType: string;
}

const UUID_PREFIX = /^[0-9a-f]{8}(-[0-9a-f-]*)?$/i;

/** Friendly name recording that `instanceId` (of `agentType`) uses the number. */
export function ownerLabel(agentType: string, instanceId: string): string {
  return `${PREFIX} ${instanceId} ${agentType}`.slice(0, TWILIO_FRIENDLY_NAME_MAX);
}

/** The owner recorded in a friendly name, or null when it records none (pool, phone number, other text). */
export function parseOwnerLabel(friendlyName: string | null | undefined): NumberOwner | null {
  if (!friendlyName) return null;
  const [prefix, ...rest] = friendlyName.trim().split(/\s+/);
  if (prefix !== PREFIX || rest.length === 0 || rest.length > 2) return null;
  const idIndex = rest.findIndex((part) => UUID_PREFIX.test(part));
  if (idIndex < 0) return null;
  const instanceId = rest[idIndex] ?? '';
  const agentType = rest[1 - idIndex] ?? '';
  return { instanceId, agentType };
}
