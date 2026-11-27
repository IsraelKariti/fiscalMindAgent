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

test('the planner stage lists its tools, the terminal tools first, and the loop rule', () => {
  const planner = describeLlmStagesStatic().find((s) => s.purpose === 'planner');
  assert.ok(planner?.tools);
  assert.equal(planner.tools[0]!.name, 'send_whatsapp_text');
  assert.ok(!planner.tools.some((t) => t.name === 'conclude'));
  assert.ok(planner.tools.some((t) => t.name === 'goal_complete') && planner.tools.some((t) => t.name === 'client_declined'));
  assert.ok(!planner.tools.some((t) => t.name === 'document_fetch'), 'no fetch provider is offered in the documented context');
  // The loop rule every provider follows (openspec `planner-answer-tools`), shown on the stages page.
  assert.deepEqual(planner.continuation, { terminalTools: ['send_whatsapp_text', 'send_whatsapp_template', 'goal_complete', 'client_declined'], maxTurns: 12 });
});

test('the planner prompt carries the untrusted-data doctrine (token named by position, never embedded), names the platform sections as trusted, and asks for no injection verdict', () => {
  const planner = describeLlmStagesStatic().find((s) => s.purpose === 'planner');
  assert.ok(planner);
  const prompt = planner.prompts[0]!.systemPrompt;
  // openspec planner-prompt-caching: the system prompt is identical across calls, so no token and no per-call placeholder.
  assert.ok(!prompt.includes('{{token}}'));
  assert.match(prompt, /בשורה הראשונה של הקלט/);
  assert.ok(!prompt.includes('suspected_injection'));
  assert.match(prompt, /המקטעים [^\n]*RUN CONTEXT[^\n]*DOCUMENT FETCH[^\n]*נכתבו על ידי המערכת/);
  assert.deepEqual(planner.placeholders, ['tax_year']);
  assert.ok(planner.query[0]!.parts[0]!.body.startsWith('--- RUN CONTEXT [{{token}}] ---'));
});
