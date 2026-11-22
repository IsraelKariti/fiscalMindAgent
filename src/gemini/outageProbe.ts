import { runLlmCall } from './llmCall.js';
import { getBudgetState } from './budget.js';
import { LLM_MODEL_OPTIONS, providerForModel } from './modelCatalog.js';
import type { OutageProvider, ProviderHold } from './outageRules.js';

/**
 * The hold probe (openspec `llm-provider-outage`): one minimal fixed call on
 * a model of the held provider — the model whose call opened the hold, else
 * the first catalog model of that provider — with `probe: true`, so it
 * bypasses the hold check and never opens a hold itself. For the budget hold
 * the probe is the spend-cap check (no audit row, no call): today's spend
 * under the ceiling again (a new day, a raised cap) means recovered.
 */
export type ProbeResult = { ok: true } | { ok: false; error: string };

export async function probeProvider(provider: OutageProvider, hold: ProviderHold): Promise<ProbeResult> {
  if (provider === 'budget') return probeBudget();
  const model = hold.model ?? LLM_MODEL_OPTIONS.find((m) => providerForModel(m) === provider) ?? null;
  if (!model) return { ok: false, error: `no model of ${provider} to probe` };
  try {
    await runLlmCall(
      {
        purpose: 'outage_probe',
        systemInstruction: 'Reply with exactly {"ok": true}.',
        contents: [{ role: 'user', parts: [{ text: 'ping' }] }],
        responseJsonSchema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
        temperature: 0,
      },
      { model, probe: true, log: { userId: null, agentInstanceId: null, clientId: null } },
    );
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function probeBudget(): Promise<ProbeResult> {
  try {
    const state = await getBudgetState();
    if (state.platformDailyUsd > 0 && state.spentTodayUsd >= state.platformDailyUsd) {
      return { ok: false, error: `LLM budget still exhausted: $${state.spentTodayUsd.toFixed(2)} spent today >= $${state.platformDailyUsd.toFixed(2)} ceiling` };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
