import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  CAPITAL_DOCUMENT_TYPE_VALUES,
  CapitalFileAnalysisSchema,
  validateClassification,
  type FileAnalysis,
} from '../src/agents/declarationOfCapital/analyzeFileRules.js';
import { CAPITAL_DOCUMENT_CATALOG } from '../src/agents/declarationOfCapital/catalog.js';

const rows = [
  { id: 'doc-1', type_key: 'bank_balance' },
  { id: 'doc-2', type_key: 'study_fund' },
  { id: 'doc-3', type_key: null },
];

function raw(over: Partial<FileAnalysis> = {}): FileAnalysis {
  return {
    document_kind: 'אישור יתרות',
    summary: 'אישור יתרות בנק לאומי',
    tax_year: '2025',
    subject_name: 'ישראל ישראלי',
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
    const g = validateClassification(raw(), rows);
    assert.equal(g.result, true);
    assert.equal(g.analysis.matched_document_id, 'doc-1');
    assert.equal(g.quarantined, false);
  });

  it('drops an id the model was not shown and reports it', () => {
    const g = validateClassification(raw({ matched_document_id: 'doc-99' }), rows);
    assert.equal(g.result, false);
    assert.equal(g.rejectedId, 'doc-99');
    assert.equal(g.analysis.matched_document_id, null);
    assert.match(g.reason ?? '', /not in the required-documents list/);
  });

  it('no match passes', () => {
    const g = validateClassification(raw({ matched_document_id: null }), rows);
    assert.equal(g.result, true);
    assert.equal(g.rejectedId, null);
  });

  it('drops a match whose row type disagrees with document_type, keeping document_type', () => {
    const g = validateClassification(raw({ matched_document_id: 'doc-2', document_type: 'bank_balance' }), rows);
    assert.equal(g.result, false);
    assert.equal(g.analysis.matched_document_id, null);
    assert.equal(g.analysis.document_type, 'bank_balance');
    assert.match(g.reason ?? '', /is of type "study_fund"/);
  });

  it('accepts an agreeing type and does not type-check rows without a type_key', () => {
    assert.equal(validateClassification(raw({ matched_document_id: 'doc-2', document_type: 'study_fund' }), rows).result, true);
    assert.equal(validateClassification(raw({ matched_document_id: 'doc-3', document_type: 'other' }), rows).result, true);
  });

  it('skips the type check when the answer carries no document_type (doc collector)', () => {
    const { document_type: _omit, ...noType } = raw({ matched_document_id: 'doc-2' });
    assert.equal(validateClassification(noType, rows).result, true);
  });

  it('quarantines suspected injection and illegible files with the verdict untouched', () => {
    const inj = validateClassification(raw({ injection_suspected: true }), rows);
    assert.equal(inj.quarantined, true);
    assert.equal(inj.quarantineReason, 'injection suspected');
    assert.equal(inj.analysis.injection_suspected, true);
    assert.equal(inj.result, true);
    const ill = validateClassification(raw({ legible: false }), rows);
    assert.equal(ill.quarantined, true);
    assert.equal(ill.quarantineReason, 'illegible');
  });

  it('never mutates the input', () => {
    const input = raw({ matched_document_id: 'doc-99' });
    validateClassification(input, rows);
    assert.equal(input.matched_document_id, 'doc-99');
  });

  it('document_type is the closed catalog + other list', () => {
    assert.deepEqual(CAPITAL_DOCUMENT_TYPE_VALUES, [...CAPITAL_DOCUMENT_CATALOG.map((t) => t.key), 'other']);
    assert.throws(() => CapitalFileAnalysisSchema.parse(raw({ document_type: 'invoice' })));
    assert.equal(CapitalFileAnalysisSchema.parse(raw({ document_type: 'other' })).document_type, 'other');
  });
});
