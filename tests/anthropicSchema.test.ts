import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { toAnthropicSchema, restoreOmittedNulls } from '../src/gemini/anthropicSchema.js';
import { DecisionResponseSchema } from '../src/agents/docCollector/decisionSchema.js';

// The 2026-09-01 prod incident: Anthropic 400 "19 parameters with type arrays
// or anyOf ... limit: 16" on the doc-collector decision schema. The adapter
// must send a schema with ZERO null-unions and reconstruct the omitted nulls
// on the way back.

const decisionJsonSchema = zodToJsonSchema(DecisionResponseSchema) as Record<string, unknown>;

/** Counts schema nodes Anthropic treats as union-typed (anyOf / type arrays). */
function countUnions(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((sum: number, n) => sum + countUnions(n), 0);
  if (node === null || typeof node !== 'object') return 0;
  let count = 0;
  for (const [key, value] of Object.entries(node)) {
    if (key === 'anyOf' && Array.isArray(value)) count++;
    if (key === 'type' && Array.isArray(value)) count++;
    if (key === 'properties' && value && typeof value === 'object') {
      count += Object.values(value).reduce((sum: number, p) => sum + countUnions(p), 0);
      continue;
    }
    count += countUnions(value);
  }
  return count;
}

describe('toAnthropicSchema', () => {
  it('leaves no union-typed parameters in the decision schema', () => {
    const converted = toAnthropicSchema(decisionJsonSchema);
    assert.equal(countUnions(converted), 0);
  });

  it('drops nullable fields from required and keeps the non-null branch', () => {
    const converted = toAnthropicSchema(decisionJsonSchema) as Record<string, unknown>;
    const required = converted.required as string[];
    assert.deepEqual(required.sort(), [
      'collected_document_ids',
      'decision',
      'matched_files',
      'reasoning',
      'suspected_injection',
    ]);
    const props = converted.properties as Record<string, Record<string, unknown>>;
    assert.equal(props.email_subject!.type, 'string');
    assert.deepEqual(props.channel!.enum, ['email', 'whatsapp']);
    // Collapsed object union keeps its own shape and required list.
    assert.equal(props.whatsapp_template!.type, 'object');
    assert.deepEqual(props.whatsapp_template!.required, ['template_id', 'variables']);
  });

  it('handles nested null-unions (instances[].description) and keeps additionalProperties:false', () => {
    const converted = toAnthropicSchema(decisionJsonSchema) as Record<string, unknown>;
    const props = converted.properties as Record<string, Record<string, unknown>>;
    const entry = (props.resolved_documents!.items as Record<string, unknown>);
    assert.equal(entry.additionalProperties, false);
    // instances/evidence were nullable members of the entry — no longer required.
    assert.deepEqual(entry.required, ['document_id', 'resolution']);
    const instanceItem = ((entry.properties as Record<string, Record<string, unknown>>).instances!
      .items as Record<string, unknown>);
    assert.deepEqual(instanceItem.required, ['name', 'already_provided']);
    assert.equal((instanceItem.properties as Record<string, Record<string, unknown>>).description!.type, 'string');
  });

  it('strips unsupported schema keywords but never field names', () => {
    const converted = toAnthropicSchema({
      type: 'object',
      properties: {
        pattern: { type: 'string', maxLength: 10 },
      },
      required: ['pattern'],
      $schema: 'http://json-schema.org/draft-07/schema#',
    }) as Record<string, unknown>;
    assert.equal(converted.$schema, undefined);
    const props = converted.properties as Record<string, Record<string, unknown>>;
    assert.deepEqual(props.pattern!, { type: 'string' });
  });
});

describe('restoreOmittedNulls', () => {
  it('restores an Anthropic answer with every nullable field omitted into a valid decision', () => {
    const answer = {
      decision: 'goal_complete',
      reasoning: 'all documents are in',
      suspected_injection: false,
      collected_document_ids: ['doc-1'],
      matched_files: [],
    };
    const restored = restoreOmittedNulls(decisionJsonSchema, answer);
    const parsed = DecisionResponseSchema.parse(restored);
    assert.equal(parsed.channel, null);
    assert.equal(parsed.send_at, null);
    assert.equal(parsed.resolved_documents, null);
    assert.equal(parsed.attestation, null);
  });

  it('restores nulls nested inside arrays and collapsed object unions', () => {
    const answer = {
      decision: 'follow_up',
      reasoning: 'ask for the missing bank statement',
      suspected_injection: false,
      collected_document_ids: [],
      matched_files: [],
      channel: 'whatsapp',
      whatsapp_text: 'שלום',
      send_at: '2026-09-02 10:00',
      resolved_documents: [
        {
          document_id: 'row-1',
          resolution: 'required',
          instances: [{ name: 'חשבון בנק לאומי', already_provided: false }],
        },
      ],
    };
    const parsed = DecisionResponseSchema.parse(restoreOmittedNulls(decisionJsonSchema, answer));
    const entry = parsed.resolved_documents?.[0];
    assert.equal(entry?.evidence, null);
    assert.equal(entry?.instances?.[0]!.description, null);
    assert.equal(parsed.email_subject, null);
    assert.equal(parsed.whatsapp_template, null);
  });

  it('leaves explicit values and explicit nulls untouched (Gemini-style answers pass through)', () => {
    const answer = {
      decision: 'follow_up',
      reasoning: 'r',
      suspected_injection: false,
      collected_document_ids: [],
      matched_files: [],
      channel: 'email',
      email_subject: 'שלום',
      email_body: 'גוף',
      whatsapp_text: null,
      whatsapp_template: null,
      send_at: '2026-09-02 10:00',
      tax_fetch_action: null,
      tax_fetch_provider: null,
      tax_fetch_document_keys: null,
      resolved_documents: null,
      added_instances: null,
      superseded_documents: null,
      attestation: null,
      attestation_evidence: null,
    };
    assert.deepEqual(restoreOmittedNulls(decisionJsonSchema, answer), answer);
  });

  it('does not invent values for omitted non-nullable fields', () => {
    const answer = { decision: 'goal_complete' };
    const restored = restoreOmittedNulls(decisionJsonSchema, answer) as Record<string, unknown>;
    assert.equal('reasoning' in restored, false);
    assert.throws(() => DecisionResponseSchema.parse(restored));
  });
});
