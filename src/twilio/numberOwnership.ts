/**
 * The Twilio friendly name of an owned number is the ownership record shared
 * by every environment on the same Twilio account (prod, sandbox, dev each
 * have their own database, so the name is the only place all of them read).
 *
 *   `fiscalmind <agentType> <agentInstanceId>` — used by that agent instance
 *   `fiscalmind pool`                          — free, nobody uses it
 *   anything else (the phone number, console text) — no record; treated as free
 *
 * Set on purchase and on assignment, reset on unassignment (provision.ts).
 */

const PREFIX = 'fiscalmind';
export const POOL_LABEL = `${PREFIX} pool`;

export interface NumberOwner {
  agentType: string;
  instanceId: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Friendly name recording that `instanceId` (of `agentType`) uses the number. */
export function ownerLabel(agentType: string, instanceId: string): string {
  return `${PREFIX} ${agentType} ${instanceId}`;
}

/** The owner recorded in a friendly name, or null when it records none (pool, phone number, other text). */
export function parseOwnerLabel(friendlyName: string | null | undefined): NumberOwner | null {
  if (!friendlyName) return null;
  const [prefix, agentType, instanceId, ...rest] = friendlyName.trim().split(/\s+/);
  if (prefix !== PREFIX || !agentType || !instanceId || rest.length > 0) return null;
  if (!UUID.test(instanceId)) return null;
  return { agentType, instanceId };
}
