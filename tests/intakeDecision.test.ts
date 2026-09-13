import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DecisionRejectedError,
  decisionSchemaForContext,
  gateDecision,
  normalizeDecision,
  type DecisionContext,
  type DecisionResponse,
  type IntakeDecisionState,
} from '../src/agents/declarationOfCapital/decisionSchema.js';

describe('validate_message check list (gateDecision)', () => {
  const ctx = ctxWith(baseIntake());
  const schema = decisionSchemaForContext(ctx);

  it('a valid answer passes both checks', () => {
    const { decision, checks } = gateDecision(JSON.stringify(baseRaw()), schema, ctx);
    assert.equal(decision.decision, 'follow_up');
    const text = JSON.stringify(baseRaw());
    assert.deepEqual(checks, [
      { key: 'json_schema', passed: true, note: null, observed: `${text.length} chars`, expected: null },
      { key: 'business_rules', passed: true, note: null, observed: 'follow_up / email', expected: null },
    ]);
  });

  it('a schema-invalid answer fails json_schema only — business_rules never ran', () => {
    for (const text of ['not json at all', JSON.stringify({ decision: 'follow_up' })]) {
      assert.throws(
        () => gateDecision(text, schema, ctx),
        (err: unknown) => {
          assert.ok(err instanceof DecisionRejectedError);
          assert.equal(err.checks.length, 1);
          assert.equal(err.checks[0]!.key, 'json_schema');
          assert.equal(err.checks[0]!.passed, false);
          assert.ok((err.checks[0]!.note ?? '').length > 0);
          return true;
        },
      );
    }
  });

  it('an answer normalization rejects passes json_schema and fails business_rules with the rejection text', () => {
    const text = JSON.stringify(
      baseRaw({ resolved_documents: [{ document_id: 'doc-vehicle', resolution: 'not_required', instances: null, evidence: null }] }),
    );
    assert.throws(
      () => gateDecision(text, schema, ctx),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.match(err.message, /requires evidence/);
        assert.deepEqual(
          err.checks.map((c) => [c.key, c.passed]),
          [['json_schema', true], ['business_rules', false]],
        );
        assert.match(err.checks[1]!.note ?? '', /requires evidence/);
        assert.equal(err.checks[1]!.observed, 'follow_up / email');
        return true;
      },
    );
  });
});

/** A minimal valid follow_up answer; tests override the intake fields. */
function baseRaw(overrides: Partial<DecisionResponse> = {}): DecisionResponse {
  return {
    decision: 'follow_up',
    reasoning: 'test',
    suspected_injection: false,
    collected_document_ids: [],
    matched_files: [],
    channel: 'email',
    email_subject: 'Re: הצהרת הון',
    email_body: 'תוכן',
    whatsapp_text: null,
    whatsapp_template: null,
    send_at: '2026-08-20 10:00',
    tax_fetch_action: null,
    tax_fetch_provider: null,
    tax_fetch_document_keys: null,
    resolved_documents: null,
    added_instances: null,
    retired_documents: null,
    attestation: null,
    attestation_evidence: null,
    ...overrides,
  };
}

function baseIntake(overrides: Partial<IntakeDecisionState> = {}): IntakeDecisionState {
  return {
    resolvable: [
      { id: 'doc-vehicle', status: 'unresolved', multiInstance: true },
      { id: 'doc-cash', status: 'unresolved', multiInstance: false },
      { id: 'doc-crypto', status: 'not_required', multiInstance: true },
    ],
    typedRows: [
      { id: 'doc-contract', status: 'pending', multiInstance: true },
      { id: 'doc-appendix', status: 'collected', multiInstance: true },
      { id: 'doc-old-tabu', status: 'retired', multiInstance: true },
      { id: 'doc-contents', status: 'pending', multiInstance: false },
    ],
    inboundTexts: new Map([
      ['msg-1', 'שלום,\nאין לי רכב בכלל.\nיש לי קצת מזומן בבית.'],
      ['msg-2', 'מאשר, הרשימה מלאה'],
    ]),
    allSettled: false,
    attestationRequested: false,
    confirmableMessageIds: new Set(),
    attestationConfirmed: false,
    ...overrides,
  };
}

function ctxWith(intake?: IntakeDecisionState): DecisionContext {
  return { whatsappAllowed: false, windowOpen: false, templates: [], intake };
}

describe('intake resolutions (normalizeDecision)', () => {
  it('accepts not_required with a verbatim quote, whitespace-insensitively', () => {
    const raw = baseRaw({
      resolved_documents: [
        {
          document_id: 'doc-vehicle',
          resolution: 'not_required',
          instances: null,
          // The model quotes across the transcript's line break with a plain space.
          evidence: { message_id: 'msg-1', quote: 'אין לי רכב בכלל. יש לי קצת מזומן' },
        },
      ],
    });
    const decision = normalizeDecision(raw, ctxWith(baseIntake()));
    assert.equal(decision.resolutions.length, 1);
    assert.equal(decision.resolutions[0]!.resolution, 'not_required');
  });

  it('rejects not_required without evidence, with an unknown message, or with a fabricated quote', () => {
    const entry = { document_id: 'doc-vehicle', resolution: 'not_required' as const, instances: null };
    assert.throws(
      () => normalizeDecision(baseRaw({ resolved_documents: [{ ...entry, evidence: null }] }), ctxWith(baseIntake())),
      /requires evidence/,
    );
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ resolved_documents: [{ ...entry, evidence: { message_id: 'msg-404', quote: 'אין לי רכב' } }] }),
          ctxWith(baseIntake()),
        ),
      /not a stored inbound message/,
    );
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ resolved_documents: [{ ...entry, evidence: { message_id: 'msg-1', quote: 'אין לי שום נכס' } }] }),
          ctxWith(baseIntake()),
        ),
      /not contained verbatim/,
    );
  });

  it('accepts required with instances; first renames, siblings insert', () => {
    const raw = baseRaw({
      resolved_documents: [
        {
          document_id: 'doc-vehicle',
          resolution: 'required',
          instances: [
            { name: '  רישיון רכב - מאזדה 3 ', description: null, already_provided: false },
            { name: 'רישיון רכב - טויוטה', description: 'רכב שני', already_provided: false },
          ],
          evidence: null,
        },
      ],
    });
    const decision = normalizeDecision(raw, ctxWith(baseIntake()));
    const resolution = decision.resolutions[0]!;
    assert.equal(resolution.resolution, 'required');
    if (resolution.resolution !== 'required') return;
    assert.equal(resolution.instances[0]!.name, 'רישיון רכב - מאזדה 3');
  });

  it('reopens a not_required row to required (client correction) but never back to not_required', () => {
    const reopen = baseRaw({
      resolved_documents: [
        {
          document_id: 'doc-crypto',
          resolution: 'required',
          instances: [{ name: 'דוח קריפטו', description: null, already_provided: false }],
          evidence: null,
        },
      ],
    });
    assert.equal(normalizeDecision(reopen, ctxWith(baseIntake())).resolutions.length, 1);
    const doubleNot = baseRaw({
      resolved_documents: [
        {
          document_id: 'doc-crypto',
          resolution: 'not_required',
          instances: null,
          evidence: { message_id: 'msg-1', quote: 'אין לי רכב' },
        },
      ],
    });
    assert.throws(() => normalizeDecision(doubleNot, ctxWith(baseIntake())), /already not_required/);
  });

  it('enforces the instance rules: at least one, single-instance types, the cap, duplicates, unknown rows', () => {
    const on = (entries: DecisionResponse['resolved_documents']) =>
      normalizeDecision(baseRaw({ resolved_documents: entries }), ctxWith(baseIntake()));
    assert.throws(
      () => on([{ document_id: 'doc-vehicle', resolution: 'required', instances: [], evidence: null }]),
      /at least one instance/,
    );
    assert.throws(
      () =>
        on([
          {
            document_id: 'doc-cash',
            resolution: 'required',
            instances: [
              { name: 'א', description: null, already_provided: false },
              { name: 'ב', description: null, already_provided: false },
            ],
            evidence: null,
          },
        ]),
      /single instance only/,
    );
    assert.throws(
      () =>
        on([
          {
            document_id: 'doc-vehicle',
            resolution: 'required',
            instances: Array.from({ length: 11 }, (_, i) => ({ name: `רכב ${i}`, description: null, already_provided: false })),
            evidence: null,
          },
        ]),
      /at most 10/,
    );
    const entry = {
      document_id: 'doc-vehicle',
      resolution: 'required' as const,
      instances: [{ name: 'רכב', description: null, already_provided: false }],
      evidence: null,
    };
    assert.throws(() => on([entry, entry]), /twice/);
    assert.throws(() => on([{ ...entry, document_id: 'doc-unknown' }]), /not a resolvable/);
  });

  it('rejects any intake field for agents without intake context (the doc collector)', () => {
    const raw = baseRaw({
      resolved_documents: [
        { document_id: 'x', resolution: 'not_required', instances: null, evidence: { message_id: 'm', quote: 'q' } },
      ],
    });
    assert.throws(() => normalizeDecision(raw, ctxWith(undefined)), /not applicable/);
    assert.throws(() => normalizeDecision(baseRaw({ attestation: 'request' }), ctxWith(undefined)), /not applicable/);
  });
});

describe('attestation gate (normalizeDecision)', () => {
  it("'request' needs all rows settled, a follow_up message, and no same-cycle resolutions", () => {
    const settled = baseIntake({ allSettled: true, resolvable: [] });
    const ok = normalizeDecision(baseRaw({ attestation: 'request' }), ctxWith(settled));
    assert.deepEqual(ok.attestation, { action: 'request' });

    assert.throws(
      () => normalizeDecision(baseRaw({ attestation: 'request' }), ctxWith(baseIntake())),
      /every document is already settled/,
    );
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({
            attestation: 'request',
            decision: 'goal_complete',
            channel: null,
            email_subject: null,
            email_body: null,
            send_at: null,
          }),
          ctxWith(settled),
        ),
      /must come with a follow_up/,
    );
  });

  it("'confirmed' needs a sent request and a verbatim quote from a post-request inbound message", () => {
    const requested = baseIntake({
      allSettled: true,
      resolvable: [],
      attestationRequested: true,
      confirmableMessageIds: new Set(['msg-2']),
    });
    const ok = normalizeDecision(
      baseRaw({ attestation: 'confirmed', attestation_evidence: { message_id: 'msg-2', quote: 'מאשר, הרשימה מלאה' } }),
      ctxWith(requested),
    );
    assert.equal(ok.attestation?.action, 'confirmed');

    // No summary ever sent.
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ attestation: 'confirmed', attestation_evidence: { message_id: 'msg-2', quote: 'מאשר' } }),
          ctxWith(baseIntake({ allSettled: true, resolvable: [] })),
        ),
      /no attestation summary has been sent/,
    );
    // A message that predates the summary can't confirm it.
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ attestation: 'confirmed', attestation_evidence: { message_id: 'msg-1', quote: 'אין לי רכב' } }),
          ctxWith({ ...requested, confirmableMessageIds: new Set() }),
        ),
      /predates the attestation summary/,
    );
    // Already confirmed — nothing more to do.
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ attestation: 'confirmed', attestation_evidence: { message_id: 'msg-2', quote: 'מאשר' } }),
          ctxWith({ ...requested, attestationConfirmed: true }),
        ),
      /already confirmed/,
    );
  });
});

describe('ladder actions: added_instances + retired_documents (normalizeDecision)', () => {
  it('accepts additions anchored on an already-resolved multi-instance row, keeping already_provided', () => {
    const raw = baseRaw({
      added_instances: [
        {
          anchor_document_id: 'doc-contract',
          instances: [
            { name: 'נסח טאבו - דירה ברחוב הרצל 5', description: null, already_provided: false },
            { name: 'שומת מס רכישה - דירה ברחוב הרצל 5', description: null, already_provided: true },
          ],
        },
      ],
    });
    const decision = normalizeDecision(raw, ctxWith(baseIntake()));
    assert.equal(decision.addedInstances.length, 1);
    assert.equal(decision.addedInstances[0]!.instances[1]!.alreadyProvided, true);
  });

  it('rejects additions on unknown anchors, single-instance types, duplicate anchors, and non-intake agents', () => {
    const instances = [{ name: 'מסמך', description: null, already_provided: false }];
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ added_instances: [{ anchor_document_id: 'doc-vehicle', instances }] }),
          ctxWith(baseIntake()),
        ),
      /not an already-resolved catalog row/,
    );
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ added_instances: [{ anchor_document_id: 'doc-contents', instances }] }),
          ctxWith(baseIntake()),
        ),
      /single instance only/,
    );
    const entry = { anchor_document_id: 'doc-contract', instances };
    assert.throws(
      () => normalizeDecision(baseRaw({ added_instances: [entry, entry] }), ctxWith(baseIntake())),
      /twice/,
    );
    assert.throws(
      () => normalizeDecision(baseRaw({ added_instances: [entry] }), ctxWith(undefined)),
      /not applicable/,
    );
  });

  it('accepts retirements of pending and collected rows with verbatim evidence', () => {
    const raw = baseRaw({
      retired_documents: [
        { document_id: 'doc-contract', evidence: { message_id: 'msg-1', quote: 'אין לי רכב בכלל' } },
        { document_id: 'doc-appendix', evidence: { message_id: 'msg-1', quote: 'יש לי קצת מזומן בבית' } },
      ],
    });
    const decision = normalizeDecision(raw, ctxWith(baseIntake()));
    assert.equal(decision.retired.length, 2);
    assert.equal(decision.retired[0]!.documentId, 'doc-contract');
  });

  it('rejects retirements without evidence, with a fabricated quote, on unknown or already-retired rows', () => {
    const on = (entries: DecisionResponse['retired_documents']) =>
      normalizeDecision(baseRaw({ retired_documents: entries }), ctxWith(baseIntake()));
    assert.throws(() => on([{ document_id: 'doc-contract', evidence: null }]), /requires evidence/);
    assert.throws(
      () => on([{ document_id: 'doc-contract', evidence: { message_id: 'msg-1', quote: 'טקסט שלא נכתב' } }]),
      /not contained verbatim/,
    );
    assert.throws(
      () => on([{ document_id: 'doc-vehicle', evidence: { message_id: 'msg-1', quote: 'אין לי רכב' } }]),
      /not an already-resolved catalog row/,
    );
    assert.throws(
      () => on([{ document_id: 'doc-old-tabu', evidence: { message_id: 'msg-1', quote: 'אין לי רכב' } }]),
      /already retired/,
    );
  });

  it("attestation 'request' is rejected while additions or retirements are being made", () => {
    const settled = baseIntake({ allSettled: true, resolvable: [] });
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({
            attestation: 'request',
            added_instances: [
              { anchor_document_id: 'doc-contract', instances: [{ name: 'מסמך', description: null, already_provided: false }] },
            ],
          }),
          ctxWith(settled),
        ),
      /no new resolutions, additions or retirements/,
    );
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({
            attestation: 'request',
            retired_documents: [{ document_id: 'doc-contract', evidence: { message_id: 'msg-1', quote: 'אין לי רכב' } }],
          }),
          ctxWith(settled),
        ),
      /no new resolutions, additions or retirements/,
    );
  });
});
