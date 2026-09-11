import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { describeLlmStagesStatic, undocumentedPurposes } from '../src/gemini/llmStages.js';
import { LLM_CALL_PURPOSES } from '../src/gemini/modelCatalog.js';

test('every LLM purpose is documented as a stage', () => {
  assert.deepEqual(undocumentedPurposes(), []);
  const stages = describeLlmStagesStatic();
  assert.deepEqual(
    stages.map((s) => s.purpose).sort(),
    [...LLM_CALL_PURPOSES].sort(),
  );
});

test('each stage carries a real prompt, a query layout, a gate and a non-empty schema', () => {
  for (const s of describeLlmStagesStatic()) {
    assert.ok(s.prompts.length >= 1, s.purpose);
    for (const p of s.prompts) assert.ok(p.systemPrompt.length > 100, `${s.purpose}: ${p.variant}`);
    assert.ok(s.query.length >= 1, s.purpose);
    assert.match(s.gate, /^(validate|verify)_/, s.purpose);
    assert.equal(typeof s.temperature, 'number', s.purpose);
    assert.ok(Object.keys(s.schema).length > 0, s.purpose);
    assert.equal((s.schema as { type?: string }).type, 'object', s.purpose);
  }
});

test('the planner prompt carries the untrusted-data doctrine with the fence token and the suspicion field', () => {
  const planner = describeLlmStagesStatic().find((s) => s.purpose === 'generate_message');
  assert.ok(planner);
  const prompt = planner.prompts[0]!.systemPrompt;
  assert.ok(prompt.includes('[{{token}}]'));
  assert.ok(prompt.includes('suspected_injection: true'));
  assert.ok(planner.placeholders.includes('token'));
});
