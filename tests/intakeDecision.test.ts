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

  it('an answer that still carries the retired suspected_injection field is accepted and the field has no effect', () => {
    const raw = {
      ...baseRaw({
        resolved_documents: [
          {
            document_id: 'doc-vehicle',
            resolution: 'not_required',
            instances: null,
            evidence: { message_id: 'msg-1', quote: 'אין לי רכב בכלל' },
          },
        ],
      }),
      suspected_injection: true,
    };
    const { decision } = gateDecision(JSON.stringify(raw), schema, ctx);
    assert.equal('suspected_injection' in decision, false);
    assert.equal(decision.resolutions.length, 1);
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

/** A real sentence of msg-1: what a "needed" resolution or an addition may rest on. */
const CASH_QUOTE = { message_id: 'msg-1', quote: 'יש לי קצת מזומן בבית' };

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
            { name: '  רישיון רכב - מאזדה 3 ', description: null, already_provided: false, file_ids: [] },
            { name: 'רישיון רכב - טויוטה', description: 'רכב שני', already_provided: false, file_ids: [] },
          ],
          evidence: CASH_QUOTE,
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
          instances: [{ name: 'דוח קריפטו', description: null, already_provided: false, file_ids: [] }],
          evidence: CASH_QUOTE,
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
      () => on([{ document_id: 'doc-vehicle', resolution: 'required', instances: [], evidence: CASH_QUOTE }]),
      /at least one instance/,
    );
    assert.throws(
      () =>
        on([
          {
            document_id: 'doc-cash',
            resolution: 'required',
            instances: [
              { name: 'א', description: null, already_provided: false, file_ids: [] },
              { name: 'ב', description: null, already_provided: false, file_ids: [] },
            ],
            evidence: CASH_QUOTE,
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
            instances: Array.from({ length: 11 }, (_, i) => ({ name: `רכב ${i}`, description: null, already_provided: false, file_ids: [] })),
            evidence: CASH_QUOTE,
          },
        ]),
      /at most 10/,
    );
    const entry = {
      document_id: 'doc-vehicle',
      resolution: 'required' as const,
      instances: [{ name: 'רכב', description: null, already_provided: false, file_ids: [] }],
      evidence: CASH_QUOTE,
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
            { name: 'נסח טאבו - דירה ברחוב הרצל 5', description: null, already_provided: false, file_ids: [] },
            { name: 'שומת מס רכישה - דירה ברחוב הרצל 5', description: null, already_provided: true, file_ids: [] },
          ],
          evidence: CASH_QUOTE,
        },
      ],
    });
    const decision = normalizeDecision(raw, ctxWith(baseIntake()));
    assert.equal(decision.addedInstances.length, 1);
    assert.equal(decision.addedInstances[0]!.instances[1]!.alreadyProvided, true);
  });

  it('rejects additions on unknown anchors, single-instance types, duplicate anchors, and non-intake agents', () => {
    const instances = [{ name: 'מסמך', description: null, already_provided: false, file_ids: [] }];
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ added_instances: [{ anchor_document_id: 'doc-vehicle', instances, evidence: CASH_QUOTE }] }),
          ctxWith(baseIntake()),
        ),
      /not an already-resolved catalog row/,
    );
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ added_instances: [{ anchor_document_id: 'doc-contents', instances, evidence: CASH_QUOTE }] }),
          ctxWith(baseIntake()),
        ),
      /single instance only/,
    );
    const entry = { anchor_document_id: 'doc-contract', instances, evidence: CASH_QUOTE };
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
              { anchor_document_id: 'doc-contract', instances: [{ name: 'מסמך', description: null, already_provided: false, file_ids: [] }], evidence: CASH_QUOTE },
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

describe('a list item is created only on the client\'s quoted words (openspec unlisted-files)', () => {
  const instances = [{ name: 'אישור קרן השתלמות בהראל', description: null, already_provided: false, file_ids: ['file-1', 'file-1'] }];
  const required = (evidence: { message_id: string; quote: string } | null) =>
    normalizeDecision(
      baseRaw({ resolved_documents: [{ document_id: 'doc-vehicle', resolution: 'required', instances, evidence }] }),
      ctxWith(baseIntake()),
    );
  const added = (evidence: { message_id: string; quote: string }) =>
    normalizeDecision(baseRaw({ added_instances: [{ anchor_document_id: 'doc-contract', instances, evidence }] }), ctxWith(baseIntake()));

  it('rejects a needed resolution without evidence — a file alone never settles a question', () => {
    assert.throws(() => required(null), /requires evidence/);
  });

  it('rejects evidence that cites a file-only message (empty text) or a message that is not the client\'s', () => {
    const ctx = ctxWith(baseIntake({ inboundTexts: new Map([['msg-file', '\n']]) }));
    const raw = (message_id: string) =>
      baseRaw({ added_instances: [{ anchor_document_id: 'doc-contract', instances, evidence: { message_id, quote: 'קרן השתלמות' } }] });
    assert.throws(() => normalizeDecision(raw('msg-file'), ctx), /not contained verbatim/);
    assert.throws(() => normalizeDecision(raw('msg-outbound'), ctx), /not a stored inbound message/);
  });

  it('rejects a quote that is not in the message (for example text of the file analysis)', () => {
    assert.throws(() => required({ message_id: 'msg-1', quote: 'אישור מס להצהרת הון' }), /not contained verbatim/);
    assert.throws(() => added({ message_id: 'msg-1', quote: 'אישור מס להצהרת הון' }), /not contained verbatim/);
  });

  it('accepts a verbatim quote, keeps it on the decision, and de-duplicates the named file ids', () => {
    const resolution = required(CASH_QUOTE).resolutions[0]!;
    assert.equal(resolution.resolution, 'required');
    if (resolution.resolution !== 'required') return;
    assert.deepEqual(resolution.evidence, CASH_QUOTE);
    assert.deepEqual(resolution.instances[0]!.fileIds, ['file-1']);
    const addition = added(CASH_QUOTE).addedInstances[0]!;
    assert.deepEqual(addition.evidence, CASH_QUOTE);
    assert.deepEqual(addition.instances[0]!.fileIds, ['file-1']);
  });

  it('a file pair keeps only valid evidence; invalid evidence is dropped, not an error', () => {
    const pairs = [
      { file_id: 'f1', document_id: 'd1', evidence: CASH_QUOTE },
      { file_id: 'f2', document_id: 'd2', evidence: { message_id: 'msg-1', quote: 'לא נאמר' } },
      { file_id: 'f3', document_id: 'd3', evidence: null },
    ];
    const decision = normalizeDecision(baseRaw({ matched_files: pairs }), ctxWith(baseIntake()));
    assert.deepEqual(decision.matched_files.map((m) => m.evidence), [CASH_QUOTE, null, null]);
  });
});
