import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runVerificationBatch, shouldWithholdDraft, type VerificationTarget } from '../src/agents/declarationOfCapital/verifyBatchRules.js';

const a: VerificationTarget = { documentId: 'doc-a', fileId: 'file-a' };
const b: VerificationTarget = { documentId: 'doc-b', fileId: 'file-b' };
const c: VerificationTarget = { documentId: 'doc-c', fileId: 'file-c' };

describe('shouldWithholdDraft', () => {
  it('withholds the draft of a cycle that collected documents', () => {
    assert.equal(shouldWithholdDraft({ afterVerification: false, targets: [a] }), true);
  });

  it('keeps the draft of a cycle that collected nothing', () => {
    assert.equal(shouldWithholdDraft({ afterVerification: false, targets: [] }), false);
  });

  it('keeps the draft of the follow-up cycle, so it cannot loop', () => {
    assert.equal(shouldWithholdDraft({ afterVerification: true, targets: [a] }), false);
  });
});

describe('runVerificationBatch', () => {
  it('verifies every target in order and returns each outcome', async () => {
    const seen: string[] = [];
    const results = await runVerificationBatch([a, b], async (t) => {
      seen.push(t.documentId);
      return t === a ? 'approved' : 'reopened';
    });
    assert.deepEqual(seen, ['doc-a', 'doc-b']);
    assert.deepEqual(results, [
      { ...a, outcome: 'approved' },
      { ...b, outcome: 'reopened' },
    ]);
  });

  it('a throwing target does not stop the batch', async () => {
    const errors: string[] = [];
    const results = await runVerificationBatch(
      [a, b, c],
      async (t) => {
        if (t === b) throw new Error('model down');
        return 'approved';
      },
      { onError: (t) => errors.push(t.documentId) },
    );
    assert.deepEqual(results.map((r) => r.outcome), ['approved', 'error', 'approved']);
    assert.deepEqual(errors, ['doc-b']);
  });

  it('runs the beforeEach hook once per target, before its verification', async () => {
    const order: string[] = [];
    await runVerificationBatch(
      [a, b],
      async (t) => {
        order.push(`verify:${t.documentId}`);
        return 'skipped';
      },
      { beforeEach: async (t) => void order.push(`before:${t.documentId}`) },
    );
    assert.deepEqual(order, ['before:doc-a', 'verify:doc-a', 'before:doc-b', 'verify:doc-b']);
  });

  it('an empty batch returns no results', async () => {
    assert.deepEqual(await runVerificationBatch([], async () => 'approved'), []);
  });
});
