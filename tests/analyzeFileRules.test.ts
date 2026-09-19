import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPITAL_DOCUMENT_TYPE_VALUES,
  CapitalFileAnalysisSchema,
  MAX_HOLDINGS,
  classifierCandidates,
  validateClassification,
  type ClassifiableDocument,
  type FileAnalysis,
} from '../src/agents/declarationOfCapital/analyzeFileRules.js';
import { CAPITAL_DOCUMENT_CATALOG } from '../src/agents/declarationOfCapital/catalog.js';
import type { Institution } from '../src/agents/declarationOfCapital/institutions.js';

const rows = [
  { id: 'doc-1', name: 'אישור יתרות בנק לאומי ליום 31.12.2025', type_key: 'bank_balance' },
  { id: 'doc-2', name: 'אישור להצהרת הון — קרן השתלמות באלטשולר שחם', type_key: 'study_fund' },
  { id: 'doc-3', name: 'מסמך שרואה החשבון הוסיף', type_key: null },
  { id: 'doc-4', name: 'אישור יתרות בנק', type_key: 'bank_balance' },
  { id: 'doc-5', name: 'רישיון רכב — טויוטה קורולה', type_key: 'vehicle' },
];

// A small table of the tests' own: the gate's behaviour must not depend on the real register.
const TABLE: Institution[] = [
  { key: 'bank_leumi', name: 'Bank Leumi', aliases: ['בנק לאומי', 'לאומי', 'Bank Leumi', 'Leumi'] },
  { key: 'altshuler_shaham', name: 'Altshuler Shaham', aliases: ['אלטשולר שחם', 'Altshuler Shaham'] },
  { key: 'harel', name: 'Harel', aliases: ['הראל', 'Harel'] },
];

const validate = (analysis: FileAnalysis, documents: ClassifiableDocument[] = rows) => validateClassification(analysis, documents, TABLE);

function raw(over: Partial<FileAnalysis> = {}): FileAnalysis {
  return {
    document_kind: 'אישור יתרות',
    summary: 'אישור יתרות בנק לאומי',
    tax_year: '2025',
    subject_name: 'ישראל ישראלי',
    issuer_name: 'Bank Leumi le-Israel B.M.',
    matched_document_id: 'doc-1',
    legible: true,
    confidence: 'high',
    injection_suspected: false,
    document_type: 'bank_balance',
    ...over,
  };
}

describe('validate_classification (validateClassification)', () => {
  it('accepts a known id whose row type agrees with document_type', () => {
    const g = validate(raw(), rows);
    assert.equal(g.result, true);
    assert.equal(g.analysis.matched_document_id, 'doc-1');
    assert.equal(g.quarantined, false);
  });

  it('drops an id the model was not shown and reports it', () => {
    const g = validate(raw({ matched_document_id: 'doc-99' }), rows);
    assert.equal(g.result, false);
    assert.equal(g.rejectedId, 'doc-99');
    assert.equal(g.analysis.matched_document_id, null);
    assert.match(g.reason ?? '', /not in the required-documents list/);
  });

  it('no match passes', () => {
    const g = validate(raw({ matched_document_id: null }), rows);
    assert.equal(g.result, true);
    assert.equal(g.rejectedId, null);
  });

  it('drops a match whose row type disagrees with document_type, keeping document_type', () => {
    const g = validate(raw({ matched_document_id: 'doc-2', document_type: 'bank_balance' }), rows);
    assert.equal(g.result, false);
    assert.equal(g.analysis.matched_document_id, null);
    assert.equal(g.analysis.document_type, 'bank_balance');
    assert.match(g.reason ?? '', /is of type "study_fund"/);
  });

  it('accepts an agreeing type and does not type-check rows without a type_key', () => {
    assert.equal(validate(raw({ matched_document_id: 'doc-2', document_type: 'study_fund', issuer_name: 'אלטשולר שחם גמל ופנסיה בע"מ' }), rows).result, true);
    assert.equal(validate(raw({ matched_document_id: 'doc-3', document_type: 'other' }), rows).result, true);
  });

  it('skips the type check when the answer carries no document_type (doc collector)', () => {
    const { document_type: _omit, ...noType } = raw({ matched_document_id: 'doc-2', issuer_name: 'Altshuler Shaham Gemel & Pension' });
    assert.equal(validate(noType, rows).result, true);
  });

  it('quarantines suspected injection and illegible files with the verdict untouched', () => {
    const inj = validate(raw({ injection_suspected: true }), rows);
    assert.equal(inj.quarantined, true);
    assert.equal(inj.quarantineReason, 'injection suspected');
    assert.equal(inj.analysis.injection_suspected, true);
    assert.equal(inj.result, true);
    const ill = validate(raw({ legible: false }), rows);
    assert.equal(ill.quarantined, true);
    assert.equal(ill.quarantineReason, 'illegible');
  });

  it('reports the checks that ran: drop rules decide result, quarantine is reported alongside', () => {
    assert.deepEqual(validate(raw(), rows).checks, [
      { key: 'matched_id_known', passed: true, note: null, observed: 'doc-1', expected: null },
      { key: 'matched_type_agrees', passed: true, note: null, observed: 'bank_balance', expected: 'bank_balance' },
      { key: 'issuer_matches_item', passed: true, note: null, observed: 'Bank Leumi', expected: 'Bank Leumi' },
      { key: 'not_injection_suspected', passed: true, note: null, observed: 'injection_suspected: false', expected: null },
      { key: 'legible', passed: true, note: null, observed: 'legible: true', expected: null },
    ]);

    const unknown = validate(raw({ matched_document_id: 'doc-99' }), rows);
    assert.equal(unknown.result, false);
    assert.deepEqual(
      unknown.checks.map((c) => [c.key, c.passed]),
      [['matched_id_known', false], ['not_injection_suspected', true], ['legible', true]],
    );
    assert.match(unknown.checks[0]!.note ?? '', /doc-99/);

    const mismatch = validate(raw({ matched_document_id: 'doc-2', document_type: 'bank_balance' }), rows);
    assert.deepEqual(
      mismatch.checks.map((c) => [c.key, c.passed]),
      [['matched_id_known', true], ['matched_type_agrees', false], ['not_injection_suspected', true], ['legible', true]],
    );
    assert.match(mismatch.checks[1]!.note ?? '', /study_fund/);
    assert.equal(mismatch.checks[1]!.observed, 'bank_balance');
    assert.equal(mismatch.checks[1]!.expected, 'study_fund');

    // No match proposed: the id checks did not run.
    assert.deepEqual(
      validate(raw({ matched_document_id: null }), rows).checks.map((c) => c.key),
      ['not_injection_suspected', 'legible'],
    );

    const inj = validate(raw({ injection_suspected: true }), rows);
    assert.equal(inj.result, true);
    assert.deepEqual(inj.checks.find((c) => c.key === 'not_injection_suspected'), {
      key: 'not_injection_suspected',
      passed: false,
      note: 'injection suspected',
      observed: 'injection_suspected: true',
      expected: null,
    });
    assert.equal(validate(raw({ legible: false }), rows).checks.find((c) => c.key === 'legible')?.passed, false);
  });

  it('company check: drops a match between two different companies and tells why', () => {
    const g = validate(raw({ matched_document_id: 'doc-2', document_type: 'study_fund', issuer_name: 'Harel Pension & Gemel' }));
    assert.equal(g.result, false);
    assert.equal(g.rejectedId, 'doc-2');
    assert.equal(g.analysis.matched_document_id, null);
    assert.match(g.analysis.match_dropped ?? '', /companies differ/);
    assert.deepEqual(g.checks.find((c) => c.key === 'issuer_matches_item'), {
      key: 'issuer_matches_item',
      passed: false,
      note: 'companies differ: the file is from Harel, the item names Altshuler Shaham',
      observed: 'Harel',
      expected: 'Altshuler Shaham',
    });
  });

  it('company check: Hebrew and English forms of one company agree', () => {
    const g = validate(raw({ issuer_name: 'בנק לאומי לישראל בע"מ' }));
    assert.equal(g.result, true);
    assert.equal(g.analysis.matched_document_id, 'doc-1');
    assert.equal(g.analysis.match_dropped, undefined);
  });

  it('company check (strict): an unidentified file company drops the match', () => {
    for (const issuer of ['קופת גמל קטנה בע"מ', null]) {
      const g = validate(raw({ issuer_name: issuer }));
      assert.equal(g.result, false);
      assert.equal(g.analysis.matched_document_id, null);
      assert.equal(g.analysis.match_dropped, 'file company not identified');
    }
  });

  it('company check (strict): an item that names no company drops the match', () => {
    const g = validate(raw({ matched_document_id: 'doc-4' }));
    assert.equal(g.result, false);
    assert.equal(g.analysis.match_dropped, 'item company not identified');
    assert.equal(g.checks.find((c) => c.key === 'issuer_matches_item')?.expected, 'not identified');
  });

  it('company check does not run for types that are not institution-bound, nor without a match', () => {
    const vehicle = validate(raw({ matched_document_id: 'doc-5', document_type: 'vehicle', issuer_name: null }));
    assert.equal(vehicle.result, true);
    assert.equal(vehicle.checks.some((c) => c.key === 'issuer_matches_item'), false);
    assert.equal(validate(raw({ matched_document_id: null })).checks.some((c) => c.key === 'issuer_matches_item'), false);
    // A match already dropped by the type check is not compared again.
    const typed = validate(raw({ matched_document_id: 'doc-2', document_type: 'bank_balance' }));
    assert.equal(typed.checks.some((c) => c.key === 'issuer_matches_item'), false);
  });

  it('classifierCandidates offers only items agreed with the client', () => {
    const statuses = ['unresolved', 'not_required', 'retired', 'pending', 'claimed', 'collected', 'approved'];
    assert.deepEqual(
      classifierCandidates(statuses.map((status) => ({ status }))).map((r) => r.status),
      ['pending', 'claimed', 'collected', 'approved'],
    );
  });

  describe('accounts list (holdings)', () => {
    const two = [
      { product: 'ביטוח מנהלים', holder_name: 'תמיר ניב', account_number: '12345678' },
      { product: 'ביטוח מנהלים', holder_name: null, account_number: null },
    ];

    it('is kept for an institution-bound type, without touching the verdict or the checks', () => {
      const without = validate(raw());
      const g = validate(raw({ holdings: two, holdings_partial: false }));
      assert.deepEqual(g.analysis.holdings, two);
      assert.equal(g.analysis.holdings_partial, false);
      assert.equal(g.result, without.result);
      assert.deepEqual(g.checks, without.checks);
    });

    it('is dropped for a type that is not institution-bound, same checks as before', () => {
      const vehicle = raw({ matched_document_id: 'doc-5', document_type: 'vehicle', issuer_name: null });
      const g = validate({ ...vehicle, holdings: two, holdings_partial: true });
      assert.deepEqual(g.analysis.holdings, []);
      assert.equal(g.analysis.holdings_partial, false);
      assert.equal(g.result, true);
      assert.deepEqual(g.checks, validate(vehicle).checks);
    });

    it('is cut to the maximum and flagged partial', () => {
      const many = Array.from({ length: MAX_HOLDINGS + 3 }, (_, i) => ({ product: 'קרן השתלמות', holder_name: null, account_number: String(i) }));
      const g = validate(raw({ holdings: many, holdings_partial: false }));
      assert.equal(g.analysis.holdings?.length, MAX_HOLDINGS);
      assert.equal(g.analysis.holdings_partial, true);
    });

    it('an analysis stored before the list existed passes through without it', () => {
      const g = validate(raw());
      assert.equal(g.analysis.holdings, undefined);
      assert.equal(g.analysis.holdings_partial, undefined);
    });

    it('the answer schema requires the list; a null holder and number are valid', () => {
      assert.throws(() => CapitalFileAnalysisSchema.parse(raw()));
      const parsed = CapitalFileAnalysisSchema.parse(raw({ holdings: two, holdings_partial: false }));
      assert.equal(parsed.holdings[1]!.holder_name, null);
    });
  });

  it('never mutates the input', () => {
    const input = raw({ matched_document_id: 'doc-99' });
    validate(input, rows);
    assert.equal(input.matched_document_id, 'doc-99');
  });

  it('document_type is the closed catalog + other list', () => {
    assert.deepEqual(CAPITAL_DOCUMENT_TYPE_VALUES, [...CAPITAL_DOCUMENT_CATALOG.map((t) => t.key), 'other']);
    assert.throws(() => CapitalFileAnalysisSchema.parse(raw({ document_type: 'invoice' })));
    assert.equal(CapitalFileAnalysisSchema.parse(raw({ document_type: 'other', holdings: [], holdings_partial: false })).document_type, 'other');
  });
});
