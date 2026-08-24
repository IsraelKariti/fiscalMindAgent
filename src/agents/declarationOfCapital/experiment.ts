import * as clients from '../../db/queries/clients.js';
import { availableModelOptions } from '../../gemini/modelSettings.js';
import { parseExperimentValue, type LlmExperimentConfig } from './experimentConfig.js';
import { recordAudit } from '../../audit/audit.js';
import { logger } from '../../util/logger.js';
import type { AgentInstanceRow, ClientRow } from '../../db/types.js';

/**
 * Admin-only LLM A/B experiments (049) for the declaration_of_capital pilot:
 * the admin defines arms (model + optional prompt-template override — models
 * respond differently to the same prompt, so each arm carries its own), and
 * each client's whole conversation runs on exactly one arm, so the two models
 * can be compared across conversations. Assignment is round-robin at the
 * client's first LLM use and sticky for the client's lifetime (an admin can
 * reassign, which only makes sense before the interview progresses).
 *
 * Everything here is invisible to the accountant: the config lives in the
 * admin-owned agent_instances.llm_experiment column, the assignment in
 * clients.llm_variant, and both are stripped by workspaceSerialize.
 */

// The schema itself is pure and lives in experimentConfig.ts (tested);
// re-exported here so the admin API imports everything from one place.
export { LlmExperimentSchema, type LlmExperimentConfig } from './experimentConfig.js';

/** The stored config, or null when absent/invalid (an old shape logs and disables). */
export function parseExperiment(instance: AgentInstanceRow | null): LlmExperimentConfig | null {
  if (!instance?.llm_experiment) return null;
  const { config, error } = parseExperimentValue(instance.llm_experiment);
  if (error !== null) {
    logger.error('llm_experiment config failed to parse — experiment disabled', {
      instanceId: instance.id,
      error,
    });
  }
  return config;
}

export interface ResolvedVariant {
  key: string;
  /** The arm's model, or null when its provider became unavailable (caller falls back to the global model). */
  model: string | null;
  /** The arm's prompt override, or null for the built-in template. */
  promptTemplate: string | null;
}

/**
 * The experiment arm this client's LLM calls run under, assigning one
 * (round-robin, fewest-clients-first) if the experiment is on and the client
 * has none yet. Null when no experiment is active — callers use the global
 * model and built-in prompt. Mutates client.llm_variant in place on assign so
 * the caller's row stays current.
 */
export async function resolveClientLlmVariant(
  client: ClientRow,
  instance: AgentInstanceRow | null,
): Promise<ResolvedVariant | null> {
  if (instance?.agent_type !== 'declaration_of_capital') return null;
  const experiment = parseExperiment(instance);
  if (!experiment?.enabled || experiment.arms.length === 0) return null;

  let arm = experiment.arms.find((a) => a.key === client.llm_variant);
  if (!arm) {
    // Keep arms balanced: the fewest-clients arm wins, first-listed on ties.
    const counts = await clients.llmVariantCounts(instance.id);
    arm = experiment.arms.reduce((best, a) => ((counts.get(a.key) ?? 0) < (counts.get(best.key) ?? 0) ? a : best));
    await clients.setLlmVariant(client.id, arm.key);
    client.llm_variant = arm.key;
    recordAudit({
      actorType: 'system',
      action: 'client.llm_variant_assigned',
      agentInstanceId: instance.id,
      clientId: client.id,
      detail: { clientName: client.name, variant: arm.key, model: arm.model },
    });
    logger.info('llm experiment: variant assigned', { clientId: client.id, variant: arm.key, model: arm.model });
  }

  // An arm whose provider key was removed must not silently call an
  // unreachable model — fall back to the global model but keep the arm's
  // prompt and attribution.
  const modelAvailable = (availableModelOptions() as readonly string[]).includes(arm.model);
  if (!modelAvailable) {
    logger.warn('llm experiment: arm model unavailable, falling back to the global model', {
      clientId: client.id,
      variant: arm.key,
      model: arm.model,
    });
  }
  return { key: arm.key, model: modelAvailable ? arm.model : null, promptTemplate: arm.promptTemplate };
}
