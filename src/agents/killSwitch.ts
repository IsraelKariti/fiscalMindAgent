import * as agentInstances from '../db/queries/agentInstances.js';
import * as appSettings from '../db/queries/appSettings.js';
import type { ClientRow } from '../db/types.js';

/**
 * The platform-wide emergency stop. When on, every agent goes quiet at once:
 * inbound webhooks are ignored, queued sends are dropped at send time, tax
 * fetches are cancelled before touching the browser, and the daily sweeps
 * skip. Stored in app_settings so flipping it needs no deploy or restart and
 * both the web and worker processes see it on their next check.
 */
export const KILL_SWITCH_SETTING_KEY = 'platform_kill_switch';

export interface KillSwitchState {
  on: boolean;
  updatedAt: Date | null;
}

export async function getKillSwitchState(): Promise<KillSwitchState> {
  const row = await appSettings.get(KILL_SWITCH_SETTING_KEY);
  return { on: row?.value === 'on', updatedAt: row?.updated_at ?? null };
}

export async function isKillSwitchOn(): Promise<boolean> {
  return (await getKillSwitchState()).on;
}

export async function setKillSwitch(on: boolean): Promise<void> {
  await appSettings.upsert(KILL_SWITCH_SETTING_KEY, on ? 'on' : 'off');
}

export type AgentBlockedReason = 'kill_switch' | 'instance_disabled';

/**
 * Why agent work for this client must not run right now, or null. The check
 * every deferred execution path (queued send, tax-fetch job) re-runs at act
 * time: disabling an instance — or the whole platform — must also stop work
 * that was enqueued while it was still enabled.
 */
export async function agentWorkBlocked(client: ClientRow): Promise<AgentBlockedReason | null> {
  if (await isKillSwitchOn()) return 'kill_switch';
  const instance = client.agent_instance_id
    ? await agentInstances.getById(client.agent_instance_id)
    : client.user_id
      ? // Legacy CLI-era clients (NULL instance) behave as doc collector, like loadAgentContext.
        await agentInstances.getByTypeForUser(client.user_id, 'doc_collector')
      : null;
  // A legacy client whose user has no doc_collector row keeps working as before.
  if (instance && !instance.enabled) return 'instance_disabled';
  return null;
}
