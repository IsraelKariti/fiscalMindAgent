import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { summarizeFallbacks, type FallbackGroup } from '../src/analytics/llmFallbacks.js';

// openspec `fallbacks-dashboard`: the counting rules of the admin fallbacks
// page, from hand-built llm_calls groups.

function group(over: Partial<FallbackGroup> & { model: string; calls: number }): FallbackGroup {
  return {
    provider: over.model.startsWith('claude') ? 'anthropic' : over.model.startsWith('gpt') ? 'openai' : 'gemini',
    purpose: 'planner',
    fallbackFromModel: null,
    fallbackFromProvider: null,
    fallbackReason: null,
    status: 'ok',
    ...over,
  };
}

const backupFor = (model: string, from: string, reason: string, calls: number, status: 'ok' | 'error' = 'ok', purpose = 'planner') =>
  group({ model, calls, status, purpose, fallbackFromModel: from, fallbackFromProvider: 'anthropic', fallbackReason: reason });

describe('summarizeFallbacks', () => {
  it('counts a failure fallback against the primary and for the backup', () => {
    const s = summarizeFallbacks([
      group({ model: 'claude-opus-5', calls: 13 }),
      group({ model: 'claude-opus-5', calls: 7, status: 'error' }),
      backupFor('gpt-6-astra', 'claude-opus-5', 'status 400', 7),
    ]);
    assert.equal(s.models.length, 2);
    const claude = s.models[0]!;
    assert.equal(claude.model, 'claude-opus-5');
    assert.deepEqual(
      { aimed: claude.primary!.aimed, fellBack: claude.primary!.fellBack, share: claude.primary!.share, failedNoBackup: claude.primary!.failedNoBackup },
      { aimed: 20, fellBack: 7, share: 0.35, failedNoBackup: 0 },
    );
    assert.deepEqual({ answered: claude.primary!.backupAnswered, failed: claude.primary!.backupFailed }, { answered: 7, failed: 0 });
    assert.deepEqual(claude.primary!.byReason, [{ reason: 'status 400', calls: 7 }]);
    assert.equal(claude.asBackup, null);
    const gpt = s.models[1]!;
    assert.equal(gpt.primary, null);
    assert.deepEqual(gpt.asBackup, { took: 7, answered: 7, fromModels: [{ model: 'claude-opus-5', calls: 7 }] });
    assert.deepEqual(s.totals, { aimed: 20, fellBack: 7, share: 0.35 });
  });

  it('counts a held-provider fallback as aimed at the primary it never reached', () => {
    const s = summarizeFallbacks([backupFor('gemini-2.5-pro', 'claude-opus-5', 'provider held', 3, 'ok', 'extract_document')]);
    const claude = s.models.find((m) => m.model === 'claude-opus-5')!;
    assert.deepEqual(
      { aimed: claude.primary!.aimed, fellBack: claude.primary!.fellBack, failedNoBackup: claude.primary!.failedNoBackup },
      { aimed: 3, fellBack: 3, failedNoBackup: 0 },
    );
    assert.deepEqual(claude.primary!.byReason, [{ reason: 'provider held', calls: 3 }]);
    assert.deepEqual(claude.primary!.byStage, [{ purpose: 'extract_document', aimed: 3, fellBack: 3, share: 1 }]);
  });

  it('reports failures with no backup and a backup that failed too', () => {
    const s = summarizeFallbacks([
      group({ model: 'gemini-2.5-pro', calls: 8 }),
      group({ model: 'gemini-2.5-pro', calls: 2, status: 'error' }),
      group({ model: 'claude-opus-5', calls: 1, status: 'error' }),
      backupFor('gpt-6-astra', 'claude-opus-5', 'timeout', 1, 'error'),
    ]);
    const gemini = s.models.find((m) => m.model === 'gemini-2.5-pro')!.primary!;
    assert.deepEqual({ aimed: gemini.aimed, fellBack: gemini.fellBack, share: gemini.share, failedNoBackup: gemini.failedNoBackup }, { aimed: 10, fellBack: 0, share: 0, failedNoBackup: 2 });
    const claude = s.models.find((m) => m.model === 'claude-opus-5')!.primary!;
    assert.deepEqual({ answered: claude.backupAnswered, failed: claude.backupFailed, failedNoBackup: claude.failedNoBackup }, { answered: 0, failed: 1, failedNoBackup: 0 });
    const gpt = s.models.find((m) => m.model === 'gpt-6-astra')!.asBackup!;
    assert.deepEqual({ took: gpt.took, answered: gpt.answered }, { took: 1, answered: 0 });
  });

  it('lists every stage aimed at the model, with the fallbacks per stage', () => {
    const s = summarizeFallbacks([
      group({ model: 'claude-opus-5', calls: 13 }),
      group({ model: 'claude-opus-5', calls: 7, status: 'error' }),
      backupFor('gpt-6-astra', 'claude-opus-5', 'status 400', 7),
      group({ model: 'claude-opus-5', calls: 50, purpose: 'injection_screen' }),
    ]);
    const claude = s.models[0]!.primary!;
    assert.deepEqual(claude.byStage, [
      { purpose: 'planner', aimed: 20, fellBack: 7, share: 0.35 },
      { purpose: 'injection_screen', aimed: 50, fellBack: 0, share: 0 },
    ]);
    assert.equal(claude.aimed, 70);
  });

  it('treats unmarked failed rows from before the mark as failed without backup', () => {
    const s = summarizeFallbacks([group({ model: 'claude-opus-5', calls: 4, status: 'error' }), group({ model: 'gpt-6-astra', calls: 4 })]);
    assert.equal(s.models.find((m) => m.model === 'claude-opus-5')!.primary!.failedNoBackup, 4);
    assert.equal(s.models.find((m) => m.model === 'gpt-6-astra')!.asBackup, null);
  });

  it('orders cards by share, then calls aimed, backup-only cards last', () => {
    const s = summarizeFallbacks([
      group({ model: 'gemini-2.5-pro', calls: 100 }),
      group({ model: 'claude-opus-5', calls: 9 }),
      group({ model: 'claude-opus-5', calls: 1, status: 'error' }),
      backupFor('gpt-6-astra', 'claude-opus-5', 'status 503', 1),
      group({ model: 'gemini-2.5-flash', calls: 5 }),
    ]);
    assert.deepEqual(
      s.models.map((m) => m.model),
      ['claude-opus-5', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gpt-6-astra'],
    );
  });

  it('is empty on no groups', () => {
    assert.deepEqual(summarizeFallbacks([]), { totals: { aimed: 0, fellBack: 0, share: 0 }, models: [] });
  });
});
