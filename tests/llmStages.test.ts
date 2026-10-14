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

test('each stage carries a real prompt, a query layout, a gate and a non-empty schema or tool set', () => {
  for (const s of describeLlmStagesStatic()) {
    assert.ok(s.prompts.length >= 1, s.purpose);
    for (const p of s.prompts) assert.ok(p.systemPrompt.length > 100, `${s.purpose}: ${p.variant}`);
    assert.ok(s.query.length >= 1, s.purpose);
    assert.match(s.gate, /^(validate|verify)_/, s.purpose);
    assert.equal(typeof s.temperature, 'number', s.purpose);
    if (s.tools) {
      // A tool-call stage (openspec `planner-answer-tools`): every tool with a flat object schema, and no form schema beside it.
      assert.equal(s.schema, undefined, s.purpose);
      assert.ok(s.tools.length > 0, s.purpose);
      for (const tool of s.tools) assert.equal((tool.parameters as { type?: string }).type, 'object', `${s.purpose}: ${tool.name}`);
    } else {
      assert.ok(s.schema && Object.keys(s.schema).length > 0, s.purpose);
      assert.equal((s.schema as { type?: string }).type, 'object', s.purpose);
    }
  }
});

test('the planner stage lists its tools, conclude first', () => {
  const planner = describeLlmStagesStatic().find((s) => s.purpose === 'generate_message');
  assert.ok(planner?.tools);
  assert.equal(planner.tools[0]!.name, 'conclude');
  assert.ok(planner.tools.some((t) => t.name === 'send_whatsapp_text'));
  assert.ok(!planner.tools.some((t) => t.name === 'tax_fetch'), 'no fetch provider is offered in the documented context');
  // The continuation rule the OpenAI adapter follows, shown on the stages page.
  assert.deepEqual(planner.continuation, { untilTool: 'conclude', maxTurns: 6 });
});

test('the planner prompt carries the untrusted-data doctrine with the fence token, names the platform sections as trusted, and asks for no injection verdict', () => {
  const planner = describeLlmStagesStatic().find((s) => s.purpose === 'generate_message');
  assert.ok(planner);
  const prompt = planner.prompts[0]!.systemPrompt;
  assert.ok(prompt.includes('[{{token}}]'));
  assert.ok(!prompt.includes('suspected_injection'));
  assert.match(prompt, /המקטעים [^\n]*DOCUMENT FETCH[^\n]*נכתבו על ידי המערכת/);
  assert.ok(planner.placeholders.includes('token'));
});
