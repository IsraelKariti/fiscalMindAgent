import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runToolLoop, type TranscriptItem, type TurnAnswer } from '../src/gemini/toolLoop.js';

// openspec `planner-answer-tools`, "The planner answers with tool calls": the
// loop sends, executes every turn's calls, answers them with their results and
// stops on an accepted terminal call, after a second text-only turn (one
// corrective user turn in between) or at the turn cap.

const usage = { inputTokens: 100, outputTokens: 10, thinkingTokens: 2, cachedTokens: 50 };
const answer = (calls: { id: string; name: string; args?: unknown }[], text = '', responseId?: string): TurnAnswer => ({
  calls: calls.map((c) => ({ id: c.id, name: c.name, args: c.args ?? {} })),
  text,
  usage,
  ...(responseId ? { responseId } : {}),
});
const opts = { maxTurns: 12, correctiveNote: 'NOTE: end the run' };

describe('runToolLoop', () => {
  it('ends on turn 1 when the executor reports an accepted terminal call, answering every call', async () => {
    const seen: TranscriptItem[][] = [];
    const res = await runToolLoop(
      async (transcript) => (seen.push([...transcript]), answer([{ id: 'c1', name: 'send_whatsapp_text' }], 'thinking aloud')),
      async (calls) => ({ results: calls.map(() => ({ name: 'send_whatsapp_text', output: 'scheduled' })), ended: true }),
      opts,
    );
    assert.equal(res.turns, 1);
    assert.equal(res.ended, 'terminal');
    assert.deepEqual(res.calls, [{ name: 'send_whatsapp_text', args: {}, turn: 1, id: 'c1', result: 'scheduled' }]);
    assert.deepEqual(res.texts, [{ turn: 1, text: 'thinking aloud' }]);
    assert.deepEqual(seen[0], []);
  });

  it('a tie, then its verdict, then the message: two turns, the results replayed to the model, the usage summed', async () => {
    const turns: TurnAnswer[] = [answer([{ id: 'c1', name: 'tie_file', args: { file_id: 'f' } }], '', 'r1'), answer([{ id: 'c2', name: 'send_whatsapp_text' }], '', 'r2')];
    const transcripts: TranscriptItem[][] = [];
    const executed: { names: string[]; turn: number }[] = [];
    const res = await runToolLoop(
      async (transcript, turn) => (transcripts.push([...transcript]), turns[turn - 1]!),
      async (calls, turn) => {
        executed.push({ names: calls.map((c) => c.name), turn });
        return calls[0]!.name === 'tie_file'
          ? { results: [{ id: 'c1', name: 'tie_file', output: 'tied · verification: APPROVED' }], ended: false }
          : { results: [{ id: 'c2', name: 'send_whatsapp_text', output: 'scheduled; the run ended' }], ended: true };
      },
      opts,
    );
    assert.equal(res.turns, 2);
    assert.equal(res.ended, 'terminal');
    assert.deepEqual(executed, [{ names: ['tie_file'], turn: 1 }, { names: ['send_whatsapp_text'], turn: 2 }]);
    assert.deepEqual(res.calls.map((c) => [c.name, c.turn, c.result]), [['tie_file', 1, 'tied · verification: APPROVED'], ['send_whatsapp_text', 2, 'scheduled; the run ended']]);
    // The second request carries the first model turn (with its response id) and the result of its call.
    assert.deepEqual(transcripts[1], [
      { kind: 'model', turn: 1, calls: [{ id: 'c1', name: 'tie_file', args: { file_id: 'f' } }], text: '', responseId: 'r1' },
      { kind: 'results', turn: 1, results: [{ id: 'c1', name: 'tie_file', output: 'tied · verification: APPROVED' }] },
    ]);
    assert.deepEqual(res.usage, { inputTokens: 200, outputTokens: 20, thinkingTokens: 4, cachedTokens: 100 });
  });

  it('a refused call is answered with the refusal and the loop goes on', async () => {
    let n = 0;
    const res = await runToolLoop(
      async () => (++n === 1 ? answer([{ id: 'a', name: 'send_whatsapp_text' }]) : answer([{ id: 'b', name: 'send_whatsapp_template' }])),
      async (calls) =>
        calls[0]!.name === 'send_whatsapp_text'
          ? { results: [{ id: 'a', name: 'send_whatsapp_text', output: 'refused: only a template outside the window' }], ended: false }
          : { results: [{ id: 'b', name: 'send_whatsapp_template', output: 'scheduled' }], ended: true },
      opts,
    );
    assert.equal(res.turns, 2);
    assert.equal(res.calls[0]!.result, 'refused: only a template outside the window');
    assert.equal(res.ended, 'terminal');
  });

  it('a text-only turn gets one corrective user turn; the next turn may still end the run', async () => {
    let n = 0;
    const transcripts: TranscriptItem[][] = [];
    const res = await runToolLoop(
      async (transcript) => (transcripts.push([...transcript]), ++n === 1 ? answer([], 'here is the message I would send') : answer([{ id: 'c', name: 'send_whatsapp_text' }])),
      async () => ({ results: [{ id: 'c', name: 'send_whatsapp_text', output: 'scheduled' }], ended: true }),
      opts,
    );
    assert.equal(res.turns, 2);
    assert.equal(res.ended, 'terminal');
    assert.deepEqual(transcripts[1], [
      { kind: 'model', turn: 1, calls: [], text: 'here is the message I would send' },
      { kind: 'user', turn: 1, text: 'NOTE: end the run' },
    ]);
    assert.deepEqual(res.texts, [{ turn: 1, text: 'here is the message I would send' }]);
  });

  it('two text-only turns fail the run with no ending', async () => {
    let executed = 0;
    const res = await runToolLoop(
      async () => answer([], 'just text'),
      async () => (executed++, { results: [], ended: false }),
      opts,
    );
    assert.equal(res.ended, 'no_ending');
    assert.equal(res.turns, 2);
    assert.equal(executed, 0);
  });

  it('a text-only turn after calls still counts as the one corrective turn', async () => {
    let n = 0;
    const res = await runToolLoop(
      async () => (++n === 1 ? answer([{ id: 'c', name: 'set_required' }]) : answer([], 'done?')),
      async () => ({ results: [{ id: 'c', name: 'set_required', output: 'resolved' }], ended: false }),
      opts,
    );
    assert.equal(res.ended, 'no_ending');
    assert.equal(res.turns, 3);
    assert.equal(res.calls.length, 1);
  });

  it('gives up at the turn cap when no terminal call is accepted', async () => {
    let n = 0;
    const res = await runToolLoop(
      async () => answer([{ id: `c${++n}`, name: 'add_instance' }]),
      async (calls) => ({ results: calls.map((c) => ({ id: c.id, name: c.name, output: 'created' })), ended: false }),
      { ...opts, maxTurns: 3 },
    );
    assert.equal(res.ended, 'cap');
    assert.equal(res.turns, 3);
    assert.equal(res.calls.length, 3);
  });

  it('every call of a turn gets a result, in call order, "done" when the executor gave none', async () => {
    const res = await runToolLoop(
      async () => answer([{ id: 'x', name: 'set_required' }, { id: 'y', name: 'tie_file' }, { id: 'z', name: 'send_whatsapp_text' }]),
      async () => ({ results: [{ id: 'x', name: 'set_required', output: 'resolved not_required' }, { id: 'y', name: 'tie_file', output: 'tied' }], ended: true }),
      opts,
    );
    assert.deepEqual(res.calls.map((c) => c.result), ['resolved not_required', 'tied', 'done']);
  });
});
