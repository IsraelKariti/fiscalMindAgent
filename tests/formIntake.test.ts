import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateFormResolutions,
  type FormAnswer,
  type FormIntakeResponse,
  type FormResolvableRow,
} from '../src/agents/declarationOfCapital/formIntakeRules.js';
import { CAPITAL_DOCUMENT_CATALOG } from '../src/agents/declarationOfCapital/catalog.js';

const rows: FormResolvableRow[] = [
  { id: 'doc-bank', typeKey: 'bank_balance', multiInstance: true },
  { id: 'doc-prior', typeKey: 'prior_declaration', multiInstance: false },
  { id: 'doc-crypto', typeKey: 'crypto', multiInstance: true },
  { id: 'doc-ins', typeKey: 'life_insurance_savings', multiInstance: true },
];

const answers: FormAnswer[] = [
  { question: 'חשבונות בנק בארץ או בחו"ל', answer: 'יש לי חשבון בלאומי וחשבון בדיסקונט' },
  { question: 'האם הגשת בעבר הצהרת הון', answer: 'לא' },
  { question: 'מטבעות דיגיטליים', answer: 'לא' },
  { question: 'ביטוח מנהלים או פוליסת חיסכון', answer: '' },
];

function raw(parts: Partial<FormIntakeResponse>): FormIntakeResponse {
  return { verdicts: {}, evidence: [], instances: [], ...parts };
}

describe('form-intake resolution validation', () => {
  it('accepts a required verdict with instances and a not_required with a real quote', () => {
    const { valid, dropped } = validateFormResolutions(
      raw({
        verdicts: { bank_balance: 'required', crypto: 'not_required' },
        evidence: [{ type_key: 'crypto', question: 'מטבעות דיגיטליים', quote: 'לא' }],
        instances: [
          { type_key: 'bank_balance', name: 'אישור יתרות בנק לאומי ליום 31.12.2025', description: '' },
          { type_key: 'bank_balance', name: 'אישור יתרות בנק דיסקונט ליום 31.12.2025', description: '' },
        ],
      }),
      rows,
      answers,
    );
    assert.equal(dropped.length, 0);
    assert.equal(valid.length, 2);
    assert.equal(valid[0]!.documentId, 'doc-bank');
    assert.equal(valid[1]!.resolution, 'not_required');
    assert.deepEqual(
      valid[1]!.resolution === 'not_required' ? valid[1]!.evidence : null,
      { source: 'form', question: 'מטבעות דיגיטליים', quote: 'לא' },
    );
  });

  it('collects unclear verdicts separately — they neither resolve nor drop', () => {
    const { valid, dropped, unclear } = validateFormResolutions(
      raw({ verdicts: { crypto: 'unclear' } }),
      rows,
      answers,
    );
    assert.equal(valid.length, 0);
    assert.equal(dropped.length, 0);
    assert.deepEqual(unclear, ['crypto']);
  });

  it('drops a not_required whose quote is not verbatim in the answers', () => {
    const { valid, dropped } = validateFormResolutions(
      raw({
        verdicts: { crypto: 'not_required' },
        evidence: [{ type_key: 'crypto', question: 'מטבעות דיגיטליים', quote: 'אין לי שום מטבעות' }],
      }),
      rows,
      answers,
    );
    assert.equal(valid.length, 0);
    assert.equal(dropped.length, 1);
    assert.match(dropped[0]!, /quote not found/);
  });

  it('quote matching is whitespace-insensitive', () => {
    const { valid } = validateFormResolutions(
      raw({
        verdicts: { bank_balance: 'required' },
        instances: [{ type_key: 'bank_balance', name: 'אישור יתרות', description: '' }],
      }),
      rows,
      answers,
    );
    assert.equal(valid.length, 1);
  });

  it('drops unknown type keys, evidence-less not_required, and instance-rule violations', () => {
    const { valid, dropped } = validateFormResolutions(
      raw({
        verdicts: {
          // Not a seeded row of this client (only possible if the provider ignored the schema).
          no_such_type: 'not_required',
          // Single-instance type given two instances.
          prior_declaration: 'required',
          // Required without any instances row.
          bank_balance: 'required',
          // not_required with no evidence row at all.
          crypto: 'not_required',
        },
        instances: [
          { type_key: 'prior_declaration', name: 'הצהרה 2019', description: '' },
          { type_key: 'prior_declaration', name: 'הצהרה 2015', description: '' },
        ],
      }),
      rows,
      answers,
    );
    assert.equal(valid.length, 0);
    assert.equal(dropped.length, 4);
  });

  it('accepts a quote-less not_required for a question left empty on the form', () => {
    const { valid, dropped } = validateFormResolutions(
      raw({
        verdicts: { life_insurance_savings: 'not_required' },
        evidence: [
          // whitespace-insensitive match against the empty question
          { type_key: 'life_insurance_savings', question: 'ביטוח מנהלים  או פוליסת חיסכון', quote: '' },
        ],
      }),
      rows,
      answers,
    );
    assert.equal(dropped.length, 0);
    assert.equal(valid.length, 1);
    assert.deepEqual(
      valid[0]!.resolution === 'not_required' ? valid[0]!.evidence : null,
      { source: 'form_empty', question: 'ביטוח מנהלים  או פוליסת חיסכון' },
    );
  });

  it('drops a quote-less not_required whose question was actually answered', () => {
    const { valid, dropped } = validateFormResolutions(
      raw({
        verdicts: { crypto: 'not_required' },
        evidence: [{ type_key: 'crypto', question: 'מטבעות דיגיטליים', quote: '' }],
      }),
      rows,
      answers,
    );
    assert.equal(valid.length, 0);
    assert.equal(dropped.length, 1);
    assert.match(dropped[0]!, /not left empty/);
  });

  it('the catalog carries the form-mapped keys the prompt promises', () => {
    const keys = new Set(CAPITAL_DOCUMENT_CATALOG.map((t) => t.key));
    for (const key of [
      'bank_balance',
      'securities_portfolio',
      'pension_provident',
      'study_fund',
      'life_insurance_savings',
      'real_estate',
      'mortgage_balance',
      'loan_taken',
      'loan_given',
      'vehicle',
      'contents_insurance',
      'business_ownership',
      'private_investment',
      'crypto',
      'poa_account',
      'prior_declaration',
      'other_assets',
    ]) {
      assert.ok(keys.has(key), key);
    }
  });
});
