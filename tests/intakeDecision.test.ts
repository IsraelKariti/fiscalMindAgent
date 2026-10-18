import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  amountAppearsIn,
  DecisionRejectedError,
  normalizeDecision,
  type DecisionContext,
  type DecisionResponse,
  type IntakeDecisionState,
} from '../src/agents/declarationOfCapital/decisionSchema.js';
import { describeCalls, gateDecision, toolsForContext } from '../src/agents/declarationOfCapital/decisionTools.js';
import { callsOf } from './helpers/decisionCalls.js';

describe('validate_message check list (gateDecision)', () => {
  const ctx = ctxWith(baseIntake());

  it('a valid answer passes both checks', () => {
    const calls = callsOf(baseRaw());
    const { decision, checks } = gateDecision(calls, ctx);
    assert.equal(decision.decision, 'follow_up');
    assert.deepEqual(checks, [
      { key: 'tool_calls', passed: true, note: null, observed: describeCalls(calls), expected: null },
      { key: 'business_rules', passed: true, note: null, observed: 'follow_up / freeform', expected: null },
    ]);
    assert.equal(checks[0]!.observed, '2 calls: conclude, send_whatsapp_text');
  });

  it('a resolution with a verbatim quote passes through the gate', () => {
    const raw = baseRaw({
      resolved_documents: [
        {
          document_id: 'doc-vehicle',
          resolution: 'not_required',
          instances: null,
          evidence: { message_id: 'msg-1', quote: 'אין לי רכב בכלל' },
        },
      ],
    });
    const { decision } = gateDecision(callsOf(raw), ctx);
    assert.equal(decision.resolutions.length, 1);
  });

  it('a shape-invalid answer fails tool_calls only — business_rules never ran', () => {
    for (const calls of [[], [{ name: 'conclude', args: { decision: 'follow_up' } }], [{ name: 'nope', args: {} }]]) {
      assert.throws(
        () => gateDecision(calls, ctx),
        (err: unknown) => {
          assert.ok(err instanceof DecisionRejectedError);
          assert.equal(err.checks.length, 1);
          assert.equal(err.checks[0]!.key, 'tool_calls');
          assert.equal(err.checks[0]!.passed, false);
          assert.ok((err.checks[0]!.note ?? '').length > 0);
          return true;
        },
      );
    }
  });

  it('an answer normalization rejects passes tool_calls and fails business_rules with the rejection text', () => {
    const calls = callsOf(
      baseRaw({ resolved_documents: [{ document_id: 'doc-vehicle', resolution: 'not_required', instances: null, evidence: null }] }),
    );
    assert.throws(
      () => gateDecision(calls, ctx),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.match(err.message, /requires evidence/);
        assert.deepEqual(
          err.checks.map((c) => [c.key, c.passed]),
          [['tool_calls', true], ['business_rules', false]],
        );
        assert.match(err.checks[1]!.note ?? '', /requires evidence/);
        assert.equal(err.checks[1]!.observed, 'follow_up / freeform');
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
    whatsapp_text: 'תוכן',
    whatsapp_template: null,
    send_at: '2026-08-20 10:00',
    tax_fetch_action: null,
    tax_fetch_provider: null,
    tax_fetch_document_keys: null,
    resolved_documents: null,
    added_instances: null,
    retired_documents: null,
    stated_costs: [],
    stated_vehicles: [],
    attestation: null,
    attestation_evidence: null,
    ...overrides,
  };
}

/** No cost stated on an instance (openspec `chat-stated-cost`): amount 0 = none. */
const NO_COST = { amount: 0, currency: '', message_id: '', quote: '' };
const NO_VEHICLE = { manufacturer: '', model: '', production_year: 0, license_plate: '', purchase_cost: 0, currency: '', message_id: '', quote: '' };

/** A real sentence of msg-1: what a "needed" resolution or an addition may rest on. */
const CASH_QUOTE = { message_id: 'msg-1', quote: 'יש לי קצת מזומן בבית' };

function baseIntake(overrides: Partial<IntakeDecisionState> = {}): IntakeDecisionState {
  return {
    resolvable: [
      { id: 'doc-vehicle', status: 'unresolved', typeKey: 'vehicle', multiInstance: true },
      { id: 'doc-cash', status: 'unresolved', typeKey: 'other_assets', multiInstance: false },
      { id: 'doc-crypto', status: 'not_required', typeKey: 'crypto', multiInstance: true },
    ],
    typedRows: [
      { id: 'doc-contract', status: 'pending', typeKey: 'real_estate', multiInstance: true },
      { id: 'doc-appendix', status: 'collected', typeKey: 'real_estate', multiInstance: true },
      { id: 'doc-old-tabu', status: 'retired', typeKey: 'real_estate', multiInstance: true },
      { id: 'doc-contents', status: 'pending', typeKey: 'contents_insurance', multiInstance: false },
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
  return { windowOpen: true, templates: [], intake };
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
            { name: '  רישיון רכב - מאזדה 3 ', description: null, already_provided: false, file_ids: [], paper_key: 'vehicle_license', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE },
            { name: 'רישיון רכב - טויוטה', description: 'רכב שני', already_provided: false, file_ids: [], paper_key: 'vehicle_license', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE },
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

  it('papers (openspec document-papers): instances of a type with papers must name one of its papers', () => {
    const intake = baseIntake({
      resolvable: [...baseIntake().resolvable, { id: 'doc-re', status: 'unresolved', typeKey: 'real_estate', multiInstance: true }],
    });
    const on = (paper_key: string, document_id = 'doc-re') =>
      normalizeDecision(
        baseRaw({
          resolved_documents: [
            {
              document_id,
              resolution: 'required',
              instances: [{ name: 'חוזה רכישה — דינוביץ 47', description: null, already_provided: false, file_ids: [], paper_key, stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }],
              evidence: CASH_QUOTE,
            },
          ],
        }),
        ctxWith(intake),
      );
    const ok = on('purchase_contract').resolutions[0]!;
    assert.equal(ok.resolution === 'required' ? ok.instances[0]!.paperKey : null, 'purchase_contract');
    assert.throws(() => on(''), /names no paper/);
    assert.throws(() => on('fund_name'), /not a paper of type "real_estate"/);
    // A vehicle instance names one of the vehicle papers (openspec `chat-stated-cost`); a crypto instance (type without papers) must not name a paper.
    assert.throws(() => on('tabu_extract', 'doc-vehicle'), /not a paper of type "vehicle"/);
    assert.throws(() => on('tabu_extract', 'doc-crypto'), /type without papers/);
    // The same rule for an addition: the anchor's type decides.
    const added = (paper_key: string) =>
      normalizeDecision(
        baseRaw({
          added_instances: [
            {
              anchor_document_id: 'doc-contract',
              instances: [{ name: 'נסח טאבו — דינוביץ 47', description: null, already_provided: false, file_ids: [], paper_key, stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }],
              evidence: CASH_QUOTE,
              proven_by_file_id: '',
            },
          ],
        }),
        ctxWith(intake),
      );
    assert.equal(added('tabu_extract').addedInstances[0]!.instances[0]!.paperKey, 'tabu_extract');
    assert.throws(() => added(''), /names no paper/);
    // The rejection surfaces through business_rules of validate_message.
    assert.throws(
      () =>
        gateDecision(
          callsOf(
            baseRaw({
              resolved_documents: [
                {
                  document_id: 'doc-re',
                  resolution: 'required',
                  instances: [{ name: 'חוזה', description: null, already_provided: false, file_ids: [], paper_key: '', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }],
                  evidence: CASH_QUOTE,
                },
              ],
            }),
          ),
          ctxWith(intake),
        ),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.deepEqual(err.checks.map((c) => [c.key, c.passed]), [['tool_calls', true], ['business_rules', false]]);
        assert.match(err.checks[1]!.note ?? '', /names no paper/);
        return true;
      },
    );
  });

  it('reopens a not_required row to required (client correction) but never back to not_required', () => {
    const reopen = baseRaw({
      resolved_documents: [
        {
          document_id: 'doc-crypto',
          resolution: 'required',
          instances: [{ name: 'דוח קריפטו', description: null, already_provided: false, file_ids: [], paper_key: '', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }],
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
              { name: 'א', description: null, already_provided: false, file_ids: [], paper_key: '', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE },
              { name: 'ב', description: null, already_provided: false, file_ids: [], paper_key: '', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE },
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
            instances: Array.from({ length: 11 }, (_, i) => ({ name: `רכב ${i}`, description: null, already_provided: false, file_ids: [], paper_key: 'vehicle_license', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE })),
            evidence: CASH_QUOTE,
          },
        ]),
      /at most 10/,
    );
    const entry = {
      document_id: 'doc-vehicle',
      resolution: 'required' as const,
      instances: [{ name: 'רכב', description: null, already_provided: false, file_ids: [], paper_key: 'vehicle_license', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }],
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
            whatsapp_text: null,
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
            { name: 'נסח טאבו - דירה ברחוב הרצל 5', description: null, already_provided: false, file_ids: [], paper_key: 'tabu_extract', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE },
            { name: 'שומת מס רכישה - דירה ברחוב הרצל 5', description: null, already_provided: true, file_ids: [], paper_key: 'purchase_tax_assessment', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE },
          ],
          evidence: CASH_QUOTE,
          proven_by_file_id: '',
        },
      ],
    });
    const decision = normalizeDecision(raw, ctxWith(baseIntake()));
    assert.equal(decision.addedInstances.length, 1);
    assert.equal(decision.addedInstances[0]!.instances[1]!.alreadyProvided, true);
  });

  it('rejects additions on unknown anchors, single-instance types, duplicate anchors, and non-intake agents', () => {
    const instances = [{ name: 'מסמך', description: null, already_provided: false, file_ids: [], paper_key: 'tabu_extract', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }];
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ added_instances: [{ anchor_document_id: 'doc-vehicle', instances, evidence: CASH_QUOTE, proven_by_file_id: '' }] }),
          ctxWith(baseIntake()),
        ),
      /not an already-resolved catalog row/,
    );
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({ added_instances: [{ anchor_document_id: 'doc-contents', instances, evidence: CASH_QUOTE, proven_by_file_id: '' }] }),
          ctxWith(baseIntake()),
        ),
      /single instance only/,
    );
    const entry = { anchor_document_id: 'doc-contract', instances, evidence: CASH_QUOTE, proven_by_file_id: '' };
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
        { document_id: 'doc-contract', evidence: { message_id: 'msg-1', quote: 'אין לי רכב בכלל' }, proven_by_file_id: '' },
        { document_id: 'doc-appendix', evidence: { message_id: 'msg-1', quote: 'יש לי קצת מזומן בבית' }, proven_by_file_id: '' },
      ],
    });
    const decision = normalizeDecision(raw, ctxWith(baseIntake()));
    assert.equal(decision.retired.length, 2);
    assert.equal(decision.retired[0]!.documentId, 'doc-contract');
  });

  it('rejects retirements without evidence, with a fabricated quote, on unknown or already-retired rows', () => {
    const on = (entries: DecisionResponse['retired_documents']) =>
      normalizeDecision(baseRaw({ retired_documents: entries }), ctxWith(baseIntake()));
    assert.throws(() => on([{ document_id: 'doc-contract', evidence: null, proven_by_file_id: '' }]), /requires evidence/);
    assert.throws(
      () => on([{ document_id: 'doc-contract', evidence: { message_id: 'msg-1', quote: 'טקסט שלא נכתב' }, proven_by_file_id: '' }]),
      /not contained verbatim/,
    );
    assert.throws(
      () => on([{ document_id: 'doc-vehicle', evidence: { message_id: 'msg-1', quote: 'אין לי רכב' }, proven_by_file_id: '' }]),
      /not an already-resolved catalog row/,
    );
    assert.throws(
      () => on([{ document_id: 'doc-old-tabu', evidence: { message_id: 'msg-1', quote: 'אין לי רכב' }, proven_by_file_id: '' }]),
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
              { anchor_document_id: 'doc-contract', instances: [{ name: 'מסמך', description: null, already_provided: false, file_ids: [], paper_key: 'tabu_extract', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }], evidence: CASH_QUOTE, proven_by_file_id: '' },
            ],
          }),
          ctxWith(settled),
        ),
      /no new resolutions, additions, retirements, stated costs or vehicle statements/,
    );
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({
            attestation: 'request',
            retired_documents: [{ document_id: 'doc-contract', evidence: { message_id: 'msg-1', quote: 'אין לי רכב' }, proven_by_file_id: '' }],
          }),
          ctxWith(settled),
        ),
      /no new resolutions, additions, retirements, stated costs or vehicle statements/,
    );
  });
});

describe('a list item is created only on the client\'s quoted words (openspec unlisted-files)', () => {
  // These answers tie a file to a row, so they are 'collect' decisions: no message, no send_at.
  const tyingRaw = (overrides: Partial<DecisionResponse> = {}): DecisionResponse =>
    baseRaw({ decision: 'collect', whatsapp_text: null, send_at: null, ...overrides });
  const instances = [{ name: 'אישור קרן השתלמות בהראל', description: null, already_provided: false, file_ids: ['file-1', 'file-1'], paper_key: 'vehicle_license', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }];
  // The contract anchor is a real_estate row: an added instance there names one of the property papers.
  const contractInstances = instances.map((i) => ({ ...i, paper_key: 'tabu_extract', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }));
  const required = (evidence: { message_id: string; quote: string } | null) =>
    normalizeDecision(
      tyingRaw({ resolved_documents: [{ document_id: 'doc-vehicle', resolution: 'required', instances, evidence }] }),
      ctxWith(baseIntake()),
    );
  const added = (evidence: { message_id: string; quote: string }) =>
    normalizeDecision(
      tyingRaw({ added_instances: [{ anchor_document_id: 'doc-contract', instances: contractInstances, evidence, proven_by_file_id: '' }] }),
      ctxWith(baseIntake()),
    );

  it('rejects a needed resolution without evidence — a file alone never settles a question', () => {
    assert.throws(() => required(null), /requires evidence/);
  });

  it('rejects evidence that cites a file-only message (empty text) or a message that is not the client\'s', () => {
    const ctx = ctxWith(baseIntake({ inboundTexts: new Map([['msg-file', '\n']]) }));
    const raw = (message_id: string) =>
      tyingRaw({
        added_instances: [{ anchor_document_id: 'doc-contract', instances: contractInstances, evidence: { message_id, quote: 'קרן השתלמות' }, proven_by_file_id: '' }],
      });
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
    const decision = normalizeDecision(tyingRaw({ matched_files: pairs }), ctxWith(baseIntake()));
    assert.deepEqual(decision.matched_files.map((m) => m.evidence), [CASH_QUOTE, null, null]);
  });
});

describe('an approved property paper as evidence (proven_by_file_id, openspec real-estate-goal-driven-clarification)', () => {
  const PRIVATE = new Map([['file-contract', { documentId: 'doc-contract', sellerKind: 'private' as const }]]);
  const BUILDER = new Map([['file-contract', { documentId: 'doc-contract', sellerKind: 'builder' as const }]]);
  const UNREAD = new Map([['file-contract', { documentId: 'doc-contract', sellerKind: null }]]);
  const withPapers = (approvedPropertyFiles: IntakeDecisionState['approvedPropertyFiles']) =>
    baseIntake({
      typedRows: [
        { id: 'doc-contract', status: 'approved', typeKey: 'real_estate', multiInstance: true, paperKey: 'purchase_contract' },
        { id: 'doc-appendix', status: 'pending', typeKey: 'real_estate', multiInstance: true, paperKey: 'payments_appendix' },
        { id: 'doc-tabu', status: 'pending', typeKey: 'real_estate', multiInstance: true, paperKey: 'tabu_extract' },
        { id: 'doc-vehicle-licence', status: 'approved', typeKey: 'vehicle', multiInstance: true, paperKey: null },
      ],
      approvedPropertyFiles,
    });
  const appendix = [{ name: 'נספח תשלומים - דינוביץ 47', description: null, already_provided: false, file_ids: [], paper_key: 'payments_appendix', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }];

  it('a private seller retires the appendix item, recording the file as the evidence', () => {
    const raw = baseRaw({ retired_documents: [{ document_id: 'doc-appendix', evidence: null, proven_by_file_id: 'file-contract' }] });
    const decision = normalizeDecision(raw, ctxWith(withPapers(PRIVATE)));
    assert.deepEqual(decision.retired, [
      { documentId: 'doc-appendix', evidence: { source: 'approved_file', file_id: 'file-contract', document_id: 'doc-contract', fact: 'seller_private' } },
    ]);
  });

  it('a builder seller adds the appendix instance', () => {
    const raw = baseRaw({ added_instances: [{ anchor_document_id: 'doc-contract', instances: appendix, evidence: null, proven_by_file_id: 'file-contract' }] });
    const decision = normalizeDecision(raw, ctxWith(withPapers(BUILDER)));
    assert.equal(decision.addedInstances.length, 1);
    assert.deepEqual(decision.addedInstances[0]!.evidence, { source: 'approved_file', file_id: 'file-contract', document_id: 'doc-contract', fact: 'seller_builder' });
  });

  it('a quote wins when both are given', () => {
    const raw = baseRaw({ retired_documents: [{ document_id: 'doc-appendix', evidence: CASH_QUOTE, proven_by_file_id: 'file-contract' }] });
    const decision = normalizeDecision(raw, ctxWith(withPapers(UNREAD)));
    assert.deepEqual(decision.retired[0]!.evidence, CASH_QUOTE);
  });

  it('rejects by name: a file that is not approved, a seller kind not read, the wrong consequence, another type', () => {
    const retire = (id: string, fileId: string) => baseRaw({ retired_documents: [{ document_id: id, evidence: null, proven_by_file_id: fileId }] });
    assert.throws(() => normalizeDecision(retire('doc-appendix', 'file-unknown'), ctxWith(withPapers(PRIVATE))), /not an approved property paper/);
    assert.throws(() => normalizeDecision(retire('doc-appendix', 'file-contract'), ctxWith(withPapers(UNREAD))), /did not read the seller kind/);
    assert.throws(() => normalizeDecision(retire('doc-tabu', 'file-contract'), ctxWith(withPapers(PRIVATE))), /proves nothing that calls for retiring/);
    assert.throws(() => normalizeDecision(retire('doc-appendix', 'file-contract'), ctxWith(withPapers(BUILDER))), /proves nothing that calls for retiring/);
    assert.throws(() => normalizeDecision(retire('doc-vehicle-licence', 'file-contract'), ctxWith(withPapers(PRIVATE))), /only for a property's payments appendix/);
    const tabu = [{ name: 'נסח טאבו - דינוביץ 47', description: null, already_provided: false, file_ids: [], paper_key: 'tabu_extract', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE }];
    assert.throws(
      () => normalizeDecision(baseRaw({ added_instances: [{ anchor_document_id: 'doc-contract', instances: tabu, evidence: null, proven_by_file_id: 'file-contract' }] }), ctxWith(withPapers(BUILDER))),
      /proves nothing that calls for these instances/,
    );
    assert.throws(
      () => normalizeDecision(baseRaw({ added_instances: [{ anchor_document_id: 'doc-contract', instances: appendix, evidence: null, proven_by_file_id: 'file-contract' }] }), ctxWith(withPapers(PRIVATE))),
      /proves nothing that calls for these instances/,
    );
    // Neither a quote nor a file: the plain evidence rule still applies.
    assert.throws(() => normalizeDecision(baseRaw({ retired_documents: [{ document_id: 'doc-appendix', evidence: null, proven_by_file_id: '' }] }), ctxWith(withPapers(PRIVATE))), /requires evidence/);
  });
});

describe('a cost stated in the chat (openspec chat-stated-cost)', () => {
  const PRICE_MSG = 'אין לי את הקבלה, שילמתי 85,000 ש"ח על המאזדה. על הדירה שילמתי לפי הערכתי 1.2 מיליון';
  const costIntake = () =>
    baseIntake({
      typedRows: [
        ...baseIntake().typedRows,
        // openspec vehicle-declaration: state_cost serves the property cost declaration only; a vehicle takes state_vehicle.
        { id: 'doc-car-cost', status: 'pending', typeKey: 'real_estate', multiInstance: true, paperKey: 'cost_declaration' },
        { id: 'doc-car-cost-done', status: 'approved', typeKey: 'real_estate', multiInstance: true, paperKey: 'cost_declaration' },
        { id: 'doc-car-decl', status: 'pending', typeKey: 'vehicle', multiInstance: true, paperKey: 'vehicle_declaration' },
        { id: 'doc-car-decl-stated', status: 'stated', typeKey: 'vehicle', multiInstance: true, paperKey: 'vehicle_declaration' },
        { id: 'doc-car-decl-done', status: 'approved', typeKey: 'vehicle', multiInstance: true, paperKey: 'vehicle_declaration' },
        { id: 'doc-car-licence', status: 'pending', typeKey: 'vehicle', multiInstance: true, paperKey: 'vehicle_license' },
        { id: 'doc-car-receipt', status: 'pending', typeKey: 'vehicle', multiInstance: true, paperKey: 'vehicle_purchase_document' },
        { id: 'doc-house-cost', status: 'pending', typeKey: 'real_estate', multiInstance: true, paperKey: 'cost_declaration' },
        { id: 'doc-bank', status: 'pending', typeKey: 'bank_balance', multiInstance: true, paperKey: null },
      ],
      inboundTexts: new Map([...baseIntake().inboundTexts, ['msg-price', PRICE_MSG]]),
    });
  const stated = (document_id: string, amount: number, quote: string, currency = 'ILS') =>
    baseRaw({ stated_costs: [{ document_id, amount, currency, evidence: { message_id: 'msg-price', quote } }] });

  it('amountAppearsIn: digits with or without separators, "N אלף" / "N מיליון"; never number words', () => {
    assert.equal(amountAppearsIn(85000, 'שילמתי 85,000 ש"ח'), true);
    assert.equal(amountAppearsIn(85000, 'שילמתי 85000'), true);
    assert.equal(amountAppearsIn(85000, 'הרכב עלה 85 אלף'), true);
    assert.equal(amountAppearsIn(1500000, 'בערך 1.5 מיליון'), true);
    assert.equal(amountAppearsIn(1250000, 'שילמתי 1,250,000 שקל על הדירה'), true);
    assert.equal(amountAppearsIn(1250000, 'שילמתי 1.250.000'), true);
    assert.equal(amountAppearsIn(85000, 'שילמתי שמונים וחמש אלף'), false);
    assert.equal(amountAppearsIn(85000, 'אין לי את הקבלה'), false);
    assert.equal(amountAppearsIn(85000, 'הרכב עלה 58,000'), false);
    assert.equal(amountAppearsIn(0, 'שילמתי 0'), false);
    // A date in the quote is not an amount.
    assert.equal(amountAppearsIn(31.12, 'ליום 31.12.2025'), false);
  });

  it('accepts a cost on a pending cost-declaration item and keeps amount, currency and the quote', () => {
    const decision = normalizeDecision(stated('doc-car-cost', 85000, 'שילמתי 85,000 ש"ח', 'ils'), ctxWith(costIntake()));
    assert.deepEqual(decision.statedCosts, [
      { documentId: 'doc-car-cost', amount: 85000, currency: 'ILS', evidence: { message_id: 'msg-price', quote: 'שילמתי 85,000 ש"ח' } },
    ]);
    const house = normalizeDecision(stated('doc-house-cost', 1200000, 'שילמתי לפי הערכתי 1.2 מיליון'), ctxWith(costIntake()));
    assert.equal(house.statedCosts[0]!.amount, 1200000);
  });

  it('accepts a cost on a new cost-declaration instance and leaves the other instances untouched', () => {
    const raw = baseRaw({
      added_instances: [
        {
          anchor_document_id: 'doc-house-cost',
          instances: [
            {
              name: 'הצהרת עלות - דירה ברחוב הרצל',
              description: null,
              already_provided: false,
              file_ids: [],
              paper_key: 'cost_declaration',
              stated_cost: { amount: 85000, currency: 'ILS', message_id: 'msg-price', quote: 'שילמתי 85,000 ש"ח על המאזדה' },
              stated_vehicle: NO_VEHICLE,
            },
            { name: 'נסח טאבו - דירה ברחוב הרצל', description: null, already_provided: false, file_ids: [], paper_key: 'tabu_extract', stated_cost: NO_COST, stated_vehicle: NO_VEHICLE },
          ],
          evidence: { message_id: 'msg-price', quote: 'אין לי את הקבלה' },
          proven_by_file_id: '',
        },
      ],
    });
    const decision = normalizeDecision(raw, ctxWith(costIntake()));
    const [cost, tabu] = decision.addedInstances[0]!.instances;
    assert.deepEqual(cost!.statedCost, { amount: 85000, currency: 'ILS', evidence: { message_id: 'msg-price', quote: 'שילמתי 85,000 ש"ח על המאזדה' } });
    assert.equal(tabu!.statedCost, null);
    assert.deepEqual(decision.statedCosts, []);
  });

  it('rejects by name: not a cost declaration, not pending, unknown item, a licence instance, a bad currency', () => {
    const ctx = ctxWith(costIntake());
    assert.throws(() => normalizeDecision(stated('doc-bank', 12000, 'שילמתי 85,000'), ctx), /only a cost declaration may be stated/);
    assert.throws(() => normalizeDecision(stated('doc-car-receipt', 85000, 'שילמתי 85,000'), ctx), /only a cost declaration may be stated/);
    // openspec vehicle-declaration: the vehicle declaration has its own tool.
    assert.throws(() => normalizeDecision(stated('doc-car-decl', 85000, 'שילמתי 85,000'), ctx), /stated with state_vehicle, not state_cost/);
    assert.throws(() => normalizeDecision(stated('doc-car-cost-done', 85000, 'שילמתי 85,000'), ctx), /is approved, not pending/);
    assert.throws(() => normalizeDecision(stated('doc-nope', 85000, 'שילמתי 85,000'), ctx), /not an already-resolved catalog row/);
    assert.throws(() => normalizeDecision(stated('doc-car-cost', 85000, 'שילמתי 85,000', 'שקלים'), ctx), /three-letter code/);
    const licence = baseRaw({
      added_instances: [
        {
          anchor_document_id: 'doc-car-receipt',
          instances: [
            {
              name: 'רישיון רכב - מאזדה 3',
              description: null,
              already_provided: false,
              file_ids: [],
              paper_key: 'vehicle_license',
              stated_cost: { amount: 85000, currency: 'ILS', message_id: 'msg-price', quote: 'שילמתי 85,000' },
              stated_vehicle: NO_VEHICLE,
            },
          ],
          evidence: { message_id: 'msg-price', quote: 'אין לי את הקבלה' },
          proven_by_file_id: '',
        },
      ],
    });
    assert.throws(() => normalizeDecision(licence, ctx), /paper vehicle_license is not a cost declaration/);
  });

  it('rejects the quote and the amount: not verbatim, amount missing, amount in words, amount 0, twice the same item', () => {
    const ctx = ctxWith(costIntake());
    assert.throws(() => normalizeDecision(stated('doc-car-cost', 85000, 'שילמתי 85,000 דולר'), ctx), /not contained verbatim/);
    assert.throws(() => normalizeDecision(stated('doc-car-cost', 85000, 'אין לי את הקבלה'), ctx), /is not written in the quote as a number/);
    assert.throws(() => normalizeDecision(stated('doc-car-cost', 90000, 'שילמתי 85,000'), ctx), /is not written in the quote as a number/);
    assert.throws(() => normalizeDecision(stated('doc-car-cost', 0, 'שילמתי 85,000'), ctx), /greater than 0/);
    assert.throws(
      () =>
        normalizeDecision(
          baseRaw({
            stated_costs: [
              { document_id: 'doc-car-cost', amount: 85000, currency: 'ILS', evidence: { message_id: 'msg-price', quote: 'שילמתי 85,000' } },
              { document_id: 'doc-car-cost', amount: 85000, currency: 'ILS', evidence: { message_id: 'msg-price', quote: 'שילמתי 85,000' } },
            ],
          }),
          ctx,
        ),
      /twice/,
    );
    assert.throws(() => normalizeDecision(stated('doc-car-cost', 85000, 'שילמתי 85,000'), ctxWith(undefined)), /not applicable/);
  });

  it('validate_message lists the stated-cost checks before business_rules, on success and on failure', () => {
    const ctx = ctxWith(costIntake());
    const ok = gateDecision(callsOf(stated('doc-car-cost', 85000, 'שילמתי 85,000 ש"ח')), ctx);
    assert.deepEqual(
      ok.checks.map((c) => [c.key, c.passed]),
      [['tool_calls', true], ['stated_cost_item_allows', true], ['stated_cost_amount_in_quote', true], ['business_rules', true]],
    );
    assert.equal(ok.checks[1]!.observed, 'paper cost_declaration, status pending');
    assert.equal(ok.checks[2]!.expected, '85000');
    assert.throws(
      () => gateDecision(callsOf(stated('doc-car-cost', 85000, 'אין לי את הקבלה')), ctx),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.deepEqual(
          err.checks.map((c) => [c.key, c.passed]),
          [['tool_calls', true], ['stated_cost_item_allows', true], ['stated_cost_amount_in_quote', false], ['business_rules', false]],
        );
        assert.equal(err.checks[2]!.observed, 'אין לי את הקבלה');
        return true;
      },
    );
    assert.throws(
      () => gateDecision(callsOf(stated('doc-bank', 85000, 'שילמתי 85,000')), ctx),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.deepEqual(
          err.checks.map((c) => [c.key, c.passed]),
          [['tool_calls', true], ['stated_cost_item_allows', false], ['business_rules', false]],
        );
        assert.match(err.checks[1]!.note ?? '', /only a cost declaration/);
        return true;
      },
    );
  });

  it('a statement alone ties no file: it stays a follow_up with a message, and a context without intake offers no state_cost tool', () => {
    const decision = normalizeDecision(stated('doc-car-cost', 85000, 'שילמתי 85,000 ש"ח'), ctxWith(costIntake()));
    assert.equal(decision.decision, 'follow_up');
    // A context without intake is not offered the checklist tools at all; an answer without them reads as "no statement".
    const noIntake = ctxWith(undefined);
    assert.ok(!toolsForContext(noIntake).some((t) => t.name === 'state_cost'));
    assert.deepEqual(normalizeDecision({ ...baseRaw(), stated_costs: [] }, noIntake).statedCosts, []);
  });
});

describe('vehicle facts stated in the chat (openspec vehicle-declaration)', () => {
  const CAR_MSG = 'לא מוצא את הרישיון. זו מאזדה 3 משנת 2019, מספר 12-345-67. שילמתי בערך 85 אלף';
  const carIntake = () =>
    baseIntake({
      typedRows: [
        ...baseIntake().typedRows,
        { id: 'doc-car-decl', status: 'pending', typeKey: 'vehicle', multiInstance: true, paperKey: 'vehicle_declaration' },
        { id: 'doc-car-decl-stated', status: 'stated', typeKey: 'vehicle', multiInstance: true, paperKey: 'vehicle_declaration' },
        { id: 'doc-car-decl-done', status: 'approved', typeKey: 'vehicle', multiInstance: true, paperKey: 'vehicle_declaration' },
        { id: 'doc-car-licence', status: 'pending', typeKey: 'vehicle', multiInstance: true, paperKey: 'vehicle_license' },
        { id: 'doc-house-cost', status: 'pending', typeKey: 'real_estate', multiInstance: true, paperKey: 'cost_declaration' },
      ],
      inboundTexts: new Map([...baseIntake().inboundTexts, ['msg-car', CAR_MSG]]),
    });
  type Facts = Partial<{ manufacturer: string; model: string; production_year: number; license_plate: string; purchase_cost: number; currency: string }>;
  const vehicle = (document_id: string, facts: Facts, quote: string) =>
    baseRaw({
      stated_vehicles: [
        {
          document_id,
          manufacturer: facts.manufacturer ?? '',
          model: facts.model ?? '',
          production_year: facts.production_year ?? 0,
          license_plate: facts.license_plate ?? '',
          purchase_cost: facts.purchase_cost ?? 0,
          currency: facts.currency ?? '',
          evidence: { message_id: 'msg-car', quote },
        },
      ],
    });

  it('accepts facts on a pending or an already stated vehicle declaration and keeps the facts and the quote', () => {
    const quote = 'זו מאזדה 3 משנת 2019, מספר 12-345-67';
    const decision = normalizeDecision(vehicle('doc-car-decl', { manufacturer: 'מאזדה', model: '3', production_year: 2019, license_plate: '12-345-67' }, quote), ctxWith(carIntake()));
    assert.deepEqual(decision.statedVehicles, [
      { documentId: 'doc-car-decl', facts: { manufacturer: 'מאזדה', model: '3', production_year: 2019, license_plate: '1234567' }, evidence: { message_id: 'msg-car', quote } },
    ]);
    assert.equal(decision.decision, 'follow_up');
    // A later message adds the cost to the stated item: "N אלף" counts, the currency defaults to ILS.
    const later = normalizeDecision(vehicle('doc-car-decl-stated', { purchase_cost: 85000 }, 'שילמתי בערך 85 אלף'), ctxWith(carIntake()));
    assert.deepEqual(later.statedVehicles[0]!.facts, { purchase_cost: 85000, currency: 'ILS' });
  });

  it('accepts facts on a new vehicle-declaration instance created in the same answer', () => {
    const raw = baseRaw({
      added_instances: [
        {
          anchor_document_id: 'doc-car-licence',
          instances: [
            {
              name: 'הצהרת הלקוח על הרכב - מאזדה 3',
              description: null,
              already_provided: false,
              file_ids: [],
              paper_key: 'vehicle_declaration',
              stated_cost: NO_COST,
              stated_vehicle: { manufacturer: 'מאזדה', model: '3', production_year: 2019, license_plate: '', purchase_cost: 0, currency: '', message_id: 'msg-car', quote: 'זו מאזדה 3 משנת 2019' },
            },
          ],
          evidence: { message_id: 'msg-car', quote: 'לא מוצא את הרישיון' },
          proven_by_file_id: '',
        },
      ],
    });
    const decision = normalizeDecision(raw, ctxWith(carIntake()));
    assert.deepEqual(decision.addedInstances[0]!.instances[0]!.statedVehicle, {
      facts: { manufacturer: 'מאזדה', model: '3', production_year: 2019 },
      evidence: { message_id: 'msg-car', quote: 'זו מאזדה 3 משנת 2019' },
    });
    assert.deepEqual(decision.statedVehicles, []);
  });

  it('rejects: a fact not in the quote (named), the wrong item, an approved item, the property tool on a vehicle; accepts a statement with no fact', () => {
    const ctx = ctxWith(carIntake());
    assert.throws(() => normalizeDecision(vehicle('doc-car-decl', { production_year: 2019 }, 'זו מאזדה 3'), ctx), /שנת ייצור \(production_year\) is not written in the quote/);
    assert.throws(() => normalizeDecision(vehicle('doc-car-decl', { license_plate: '1234567' }, 'זו מאזדה 3'), ctx), /מספר רישוי \(license_plate\) is not written/);
    assert.throws(() => normalizeDecision(vehicle('doc-car-decl', { manufacturer: 'טויוטה' }, 'זו מאזדה 3'), ctx), /תוצר \(manufacturer\) is not written/);
    assert.throws(() => normalizeDecision(vehicle('doc-car-decl', { purchase_cost: 90000 }, 'שילמתי בערך 85 אלף'), ctx), /עלות הרכישה \(purchase_cost\) is not written/);
    // No fact at all is a valid statement: the client's "don't know" closes the declaration with every fact unknown.
    assert.deepEqual(normalizeDecision(vehicle('doc-car-decl', {}, 'לא מוצא את הרישיון'), ctx).statedVehicles[0]!.facts, {});
    assert.throws(() => normalizeDecision(vehicle('doc-car-licence', { manufacturer: 'מאזדה' }, 'זו מאזדה 3'), ctx), /only a vehicle declaration may be stated with state_vehicle/);
    assert.throws(() => normalizeDecision(vehicle('doc-house-cost', { manufacturer: 'מאזדה' }, 'זו מאזדה 3'), ctx), /state it with state_cost, not state_vehicle/);
    assert.throws(() => normalizeDecision(vehicle('doc-car-decl-done', { manufacturer: 'מאזדה' }, 'זו מאזדה 3'), ctx), /is approved — a vehicle statement fills/);
    assert.throws(() => normalizeDecision(vehicle('doc-car-decl', { manufacturer: 'מאזדה' }, 'זו מאזדה 3 חדשה'), ctx), /not contained verbatim/);
    assert.throws(() => normalizeDecision(vehicle('doc-car-decl', { production_year: 19 }, 'משנת 2019'), ctx), /four-digit year/);
    assert.throws(() => normalizeDecision(vehicle('doc-car-decl', { manufacturer: 'מאזדה' }, 'זו מאזדה 3'), ctxWith(undefined)), /not applicable/);
  });

  it('validate_message lists the vehicle checks before business_rules, on success and on failure', () => {
    const ctx = ctxWith(carIntake());
    const quote = 'זו מאזדה 3 משנת 2019, מספר 12-345-67';
    const ok = gateDecision(callsOf(vehicle('doc-car-decl', { manufacturer: 'מאזדה', production_year: 2019, license_plate: '1234567' }, quote)), ctx);
    assert.deepEqual(
      ok.checks.map((c) => [c.key, c.passed]),
      [['tool_calls', true], ['stated_vehicle_item_allows', true], ['stated_vehicle_facts_in_quote', true], ['business_rules', true]],
    );
    assert.equal(ok.checks[1]!.observed, 'paper vehicle_declaration, status pending');
    assert.equal(ok.checks[2]!.observed, quote);
    assert.equal(ok.checks[2]!.expected, 'תוצר, שנת ייצור, מספר רישוי');
    assert.throws(
      () => gateDecision(callsOf(vehicle('doc-car-decl', { license_plate: '1234567' }, 'זו מאזדה 3')), ctx),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.deepEqual(
          err.checks.map((c) => [c.key, c.passed]),
          [['tool_calls', true], ['stated_vehicle_item_allows', true], ['stated_vehicle_facts_in_quote', false], ['business_rules', false]],
        );
        assert.match(err.checks[2]!.note ?? '', /מספר רישוי/);
        return true;
      },
    );
    assert.throws(
      () => gateDecision(callsOf(vehicle('doc-car-licence', { manufacturer: 'מאזדה' }, 'זו מאזדה 3')), ctx),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.deepEqual(
          err.checks.map((c) => [c.key, c.passed]),
          [['tool_calls', true], ['stated_vehicle_item_allows', false], ['business_rules', false]],
        );
        assert.equal(err.checks[1]!.observed, 'paper vehicle_license, status pending');
        return true;
      },
    );
  });
});
