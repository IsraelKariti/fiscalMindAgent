import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { decisionSchemaForContext, type DecisionContext } from '../src/agents/declarationOfCapital/decisionSchema.js';
import { decisionJsonSchemaForContext } from '../src/agents/declarationOfCapital/decide.js';

// openspec `planner-answer-schema`, "The WhatsApp-only form stays under the
// Anthropic budget". Anthropic's structured-output grammar budgets about 16
// union/optional-typed places per schema, nested ones included (prod incident
// 2026-09-01, HTTP 400 "schema is too complex"). The adapter turns every
// "value or null" place into an optional field, so each nullable place costs
// one unit of that budget. The threshold below is one under the budget on
// purpose: adding a nullable field to the planner's form must be a decision,
// not an accident. If this test fails, remove or merge a nullable place, or
// prune a group the client cannot use — do not just raise the number.
const MAX_NULLABLE_PLACES = 15;

/** The request-schema context of production today: capital declaration on WhatsApp, no fetch provider offered. */
const CAPITAL_DECLARATION_NO_FETCH: DecisionContext = {
  windowOpen: true,
  templates: [],
  intake: {
    resolvable: [],
    typedRows: [],
    inboundTexts: new Map(),
    allSettled: false,
    attestationRequested: false,
    confirmableMessageIds: new Set(),
    attestationConfirmed: false,
  },
};

function isNullSchema(node: unknown): boolean {
  return typeof node === 'object' && node !== null && (node as { type?: unknown }).type === 'null';
}

/** Counts every place, at any depth, that admits null: an `anyOf` with a null branch or a `type` array containing 'null'. */
export function countNullablePlaces(node: unknown, path = '$', found: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((n, i) => countNullablePlaces(n, `${path}[${i}]`, found));
    return found;
  }
  if (node === null || typeof node !== 'object') return found;
  const obj = node as Record<string, unknown>;
  const nullable =
    (Array.isArray(obj.anyOf) && obj.anyOf.some(isNullSchema)) || (Array.isArray(obj.type) && obj.type.includes('null'));
  if (nullable) found.push(path);
  for (const [key, value] of Object.entries(obj)) {
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const [name, prop] of Object.entries(value as Record<string, unknown>)) countNullablePlaces(prop, `${path}.${name}`, found);
    } else if (key === 'items' || key === 'anyOf') {
      countNullablePlaces(value, path, found);
    }
  }
  return found;
}

describe('planner answer form: nullable-place budget (openspec planner-answer-schema)', () => {
  const json = zodToJsonSchema(decisionSchemaForContext(CAPITAL_DECLARATION_NO_FETCH) as never) as Record<string, unknown>;
  const places = countNullablePlaces(json);

  it(`the WhatsApp-only capital-declaration form has at most ${MAX_NULLABLE_PLACES} "value or null" places`, () => {
    assert.ok(
      places.length <= MAX_NULLABLE_PLACES,
      `${places.length} nullable places (budget ${MAX_NULLABLE_PLACES}):\n${places.join('\n')}`,
    );
  });

  it('counts exactly the places the form has today, so a new one is noticed', () => {
    // 11 nullable top-level fields minus the 3 pruned tax-fetch fields = 8, plus 7 nested places:
    // matched_files[].evidence; resolved_documents[].instances, [].instances[].description, [].evidence;
    // added_instances[].instances[].description, [].evidence; retired_documents[].evidence.
    assert.equal(places.length, 15, `nullable places:\n${places.join('\n')}`);
  });

  it('the request schema sent to the model has no $ref pointers (Anthropic rejects them under properties)', () => {
    // A Zod object used in two places (stated_cost on resolved and added instances) must be inlined
    // twice, never emitted once and referenced: Anthropic answers 400 "References must be defined
    // under '$defs'" for a `$ref` inside `properties`. Found in the evals on 2026-10-13.
    const text = JSON.stringify(decisionJsonSchemaForContext(CAPITAL_DECLARATION_NO_FETCH));
    assert.equal(text.includes('"$ref"'), false, 'request schema contains a $ref');
    assert.equal(text.includes('"$schema"'), false);
    assert.ok(text.includes('"stated_cost"'));
  });

  it('sanity: the counter sees nested and top-level places', () => {
    const sample = {
      type: 'object',
      properties: {
        a: { type: ['string', 'null'] },
        b: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        c: { type: 'array', items: { type: 'object', properties: { d: { type: ['number', 'null'] } } } },
        e: { type: 'string' },
      },
    };
    assert.deepEqual(countNullablePlaces(sample), ['$.a', '$.b', '$.c.d']);
  });
});
