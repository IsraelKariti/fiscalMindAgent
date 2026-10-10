import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { approvedPropertyFilesOf, provenFactsLine, provenFactsOf } from '../src/agents/declarationOfCapital/provenFacts.js';
import { buildDocumentsSection, buildVerificationResultsSection } from '../src/agents/declarationOfCapital/prompt.js';
import type { ClientDocumentRow } from '../src/db/types.js';

const TOKEN = 'tok123';

const CONTRACT_EXTRACTION = {
  is_expected_type: true,
  actual_kind: 'חוזה רכישה',
  issuer: null,
  parties: [
    { name: 'מקמל חזי', id_number: '054321087', role: 'counterparty' },
    { name: 'מקמל קתי פנינה', id_number: '022334455', role: 'counterparty' },
    { name: 'תמיר ניב', id_number: '025699448', role: 'owner' },
    { name: 'תמיר מיכל', id_number: '033445560', role: 'owner' },
    { name: 'עו"ד ד. לוי', id_number: null, role: 'other' },
  ],
  as_of_date: null,
  valid_until: null,
  amounts: [{ label: 'התמורה', value: 1_250_000, currency: 'ILS' }],
  legible: true,
  injection_suspected: false,
  property_address: 'דינוביץ אבשלום 47, פתח תקווה',
  purchase_price: 1_250_000,
  price_currency: 'ILS',
  purchase_year: 2001,
  seller_kind: 'private',
};

const row = (overrides: Partial<ClientDocumentRow>): ClientDocumentRow =>
  ({
    id: 'doc-contract',
    client_id: 'c1',
    name: 'חוזה רכישה — דינוביץ 47',
    description: null,
    status: 'approved',
    type_key: 'real_estate',
    paper_key: 'purchase_contract',
    verification: { passed: true, attempts: 1, file_id: 'file-1', reasons: [], verified_at: '2026-10-09T15:55:00Z', extracted: CONTRACT_EXTRACTION },
    resolution_evidence: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    updated_at: new Date('2026-10-09T00:00:00Z'),
    ...overrides,
  }) as ClientDocumentRow;

describe('provenFactsOf — what an approved property paper proved', () => {
  it('a full contract record: owners, price, seller kind, year, address', () => {
    const facts = provenFactsOf(row({}));
    assert.deepEqual(facts, {
      owners: ['תמיר ניב', 'תמיר מיכל'],
      purchasePrice: { value: 1_250_000, currency: 'ILS' },
      sellerKind: 'private',
      address: 'דינוביץ אבשלום 47, פתח תקווה',
      purchaseYear: 2001,
    });
    assert.equal(
      provenFactsLine(facts),
      'הוכח במסמך שאושר: בעלות — על שם תמיר ניב, תמיר מיכל; עלות רכישה — 1,250,000 ILS; המוכר — אדם פרטי (= נרכש יד שנייה); שנת רכישה — 2001; כתובת — דינוביץ אבשלום 47, פתח תקווה',
    );
  });

  it('a tabu extract record: owners only', () => {
    const extracted = { ...CONTRACT_EXTRACTION, parties: CONTRACT_EXTRACTION.parties.filter((p) => p.role === 'owner'), purchase_price: null, price_currency: null, purchase_year: null, seller_kind: null, property_address: 'גוש 6325 חלקה 161' };
    const facts = provenFactsOf(row({ paper_key: 'tabu_extract', verification: { passed: true, file_id: 'file-2', extracted } }));
    assert.deepEqual(facts, { owners: ['תמיר ניב', 'תמיר מיכל'], purchasePrice: null, sellerKind: null, address: 'גוש 6325 חלקה 161', purchaseYear: null });
    assert.equal(provenFactsLine(facts), 'הוכח במסמך שאושר: בעלות — על שם תמיר ניב, תמיר מיכל; כתובת — גוש 6325 חלקה 161');
  });

  it('a record approved before the typed fields existed: owners only; a builder seller is named as such', () => {
    const { property_address: _a, purchase_price: _p, price_currency: _c, purchase_year: _y, seller_kind: _s, ...old } = CONTRACT_EXTRACTION;
    const facts = provenFactsOf(row({ verification: { passed: true, file_id: 'file-1', extracted: old } }));
    assert.deepEqual(facts, { owners: ['תמיר ניב', 'תמיר מיכל'], purchasePrice: null, sellerKind: null, address: null, purchaseYear: null });
    const builder = provenFactsOf(row({ verification: { passed: true, file_id: 'file-1', extracted: { ...old, seller_kind: 'builder' } } }));
    assert.equal(builder?.sellerKind, 'builder');
    assert.match(provenFactsLine(builder) ?? '', /המוכר — קבלן \/ חברה \(= נרכש מקבלן\)/);
  });

  it('nothing for a record without parties and fields, a non-approved row, another type, or a malformed seller kind', () => {
    assert.equal(provenFactsOf(row({ verification: { passed: true, file_id: 'file-1', extracted: { parties: [] } } })), null);
    assert.equal(provenFactsOf(row({ status: 'collected' })), null);
    assert.equal(provenFactsOf(row({ status: 'pending', verification: { passed: false, reasons: ['x'], extracted: CONTRACT_EXTRACTION } })), null);
    assert.equal(provenFactsOf(row({ type_key: 'vehicle' })), null);
    assert.equal(provenFactsOf(row({ verification: null })), null);
    const odd = provenFactsOf(row({ verification: { passed: true, file_id: 'file-1', extracted: { ...CONTRACT_EXTRACTION, seller_kind: 'company' } } }));
    assert.equal(odd?.sellerKind, null);
    assert.equal(provenFactsLine(null), null);
  });

  it('the documents section carries the line on the approved item only', () => {
    const section = buildDocumentsSection(TOKEN, [row({}), row({ id: 'doc-tabu', status: 'pending', paper_key: 'tabu_extract', verification: null })], 2025);
    const lines = section.split('\n');
    const contract = lines.find((l) => l.startsWith('[id: doc-contract]')) ?? '';
    const tabu = lines.find((l) => l.startsWith('[id: doc-tabu]')) ?? '';
    assert.match(contract, /\| הוכח במסמך שאושר: בעלות — על שם תמיר ניב, תמיר מיכל; עלות רכישה — 1,250,000 ILS; המוכר — אדם פרטי/);
    assert.doesNotMatch(tabu, /הוכח במסמך שאושר/);
  });

  it('the verification results block appends the facts to an APPROVED line only', () => {
    const base = { documentId: 'doc-contract', documentName: 'חוזה רכישה — דינוביץ 47', fileId: 'file-1', fileName: 'contract.pdf', reasons: [] as string[] };
    const facts = provenFactsLine(provenFactsOf(row({})));
    const approved = buildVerificationResultsSection(TOKEN, [{ ...base, outcome: 'approved', provenFacts: facts }], true);
    assert.match(approved, /APPROVED — the document is closed \| הוכח במסמך שאושר: בעלות — על שם תמיר ניב/);
    const rejected = buildVerificationResultsSection(TOKEN, [{ ...base, outcome: 'reopened', reasons: ['הקונה אינו הלקוח'], provenFacts: facts }], true);
    assert.doesNotMatch(rejected, /הוכח במסמך שאושר/);
    assert.match(rejected, /REJECTED: הקונה אינו הלקוח/);
  });

  it('approvedPropertyFilesOf keys the approved papers by their verified file id, with the seller kind', () => {
    const pool = approvedPropertyFilesOf([
      row({}),
      row({ id: 'doc-tabu', paper_key: 'tabu_extract', verification: { passed: true, file_id: 'file-2', extracted: { ...CONTRACT_EXTRACTION, seller_kind: null } } }),
      row({ id: 'doc-pending', status: 'pending', verification: null }),
      row({ id: 'doc-nofile', verification: { passed: true, extracted: CONTRACT_EXTRACTION } }),
    ]);
    assert.deepEqual([...pool.entries()], [
      ['file-1', { documentId: 'doc-contract', sellerKind: 'private' }],
      ['file-2', { documentId: 'doc-tabu', sellerKind: null }],
    ]);
  });
});
