import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { companyAppearsInQuote, companyRename, rowCompanyUnknown, sitesForUnnamedRow } from '../src/agents/declarationOfCapital/companyClarification.js';
import { buildDocumentsSection } from '../src/agents/declarationOfCapital/prompt.js';
import { listProviderSpecs } from '../src/agents/declarationOfCapital/documentFetch/providers.js';
import { compareCompanies } from '../src/agents/declarationOfCapital/institutions.js';
import { DecisionRejectedError, type DecisionContext, type IntakeDecisionState } from '../src/agents/declarationOfCapital/decisionSchema.js';
import { setCompanyDetail } from '../src/agents/declarationOfCapital/toolStepDetails.js';
import { callsOf, type TestAnswer as DecisionResponse } from './helpers/decisionCalls.js';
import { gate as gateDecision } from './helpers/judge.js';
import type { ClientDocumentRow } from '../src/db/types.js';

// openspec `item-company-clarification`: a pending fund / account / policy row
// that names no company is marked in the prompt, the agent asks the client,
// and `set_company` renames the row on the client's words so the fetch sites
// and the company comparison find it.

const PENSION = 'אישור יתרת קרן פנסיה ליום 31.12.2025 — קרן פנסיה';
const STUDY_FUND = 'אישור יתרת קרן השתלמות ליום 31.12.2025 — קרן השתלמות';
const FUND_SITES = ['אלטשולר שחם', 'הראל', 'הפניקס', 'מגדל', 'מיטב', 'מנורה מבטחים'];

const row = (overrides: Partial<ClientDocumentRow>): ClientDocumentRow =>
  ({
    id: 'doc-pension',
    client_id: 'c1',
    name: PENSION,
    description: null,
    status: 'pending',
    type_key: 'pension_provident',
    paper_key: null,
    verification: null,
    resolution_evidence: null,
    created_at: new Date('2026-10-01T00:00:00Z'),
    updated_at: new Date('2026-10-09T00:00:00Z'),
    ...overrides,
  }) as ClientDocumentRow;

describe('rowCompanyUnknown', () => {
  it('a pending fund row from the questionnaire with no company is unknown', () => {
    assert.equal(rowCompanyUnknown(row({})), true);
    assert.equal(rowCompanyUnknown(row({ name: STUDY_FUND, type_key: 'study_fund' })), true);
  });

  it('a row that names its company, a settled row, and a row of a type that is not institution-bound are not', () => {
    assert.equal(rowCompanyUnknown(row({ name: `${STUDY_FUND} — הראל` })), false);
    assert.equal(rowCompanyUnknown(row({ name: 'אישור יתרות הבנק הבינלאומי ליום 31.12.2025', type_key: 'bank_balance' })), false);
    assert.equal(rowCompanyUnknown(row({ status: 'collected' })), false);
    assert.equal(rowCompanyUnknown(row({ status: 'claimed' })), false);
    assert.equal(rowCompanyUnknown(row({ name: 'חוזה רכישה — דירה', type_key: 'real_estate' })), false);
  });
});

describe('sitesForUnnamedRow — the sites a company answer would unlock (the real provider matchers)', () => {
  const specs = listProviderSpecs();

  it('a pension row: the six fund sites, never the tax authority', () => {
    assert.deepEqual([...sitesForUnnamedRow(PENSION, specs)].sort(), [...FUND_SITES].sort());
  });

  it('a study-fund row: only sites with a study-fund type', () => {
    const sites = sitesForUnnamedRow(STUDY_FUND, specs);
    assert.ok(sites.length > 0);
    for (const site of sites) {
      const spec = specs.find((s) => s.siteNameHe === site)!;
      assert.ok(spec.documents.some((d) => d.key === 'study_fund_annual'), site);
    }
    assert.ok(!sites.includes('רשות המסים'));
  });

  it('a row no site fetches gets none; no usable provider gives none', () => {
    assert.deepEqual(sitesForUnnamedRow('פוליסת ביטוח תכולה', specs), []);
    assert.deepEqual(sitesForUnnamedRow(PENSION, []), []);
  });
});

describe('the prompt marks a row whose company is unknown', () => {
  const TOKEN = 'tok123';
  const sites = new Map([['doc-pension', FUND_SITES]]);
  const lineOf = (doc: ClientDocumentRow, s = sites) =>
    buildDocumentsSection(TOKEN, [doc], 2025, s)
      .split('\n')
      .find((l) => l.includes(doc.id))!;

  it('fund item from the questionnaire with no company: the note and the sites', () => {
    const line = lineOf(row({}));
    assert.match(line, /חברה: לא ידועה/);
    assert.match(line, /set_company/);
    for (const site of FUND_SITES) assert.ok(line.includes(site), site);
  });

  it('client without a resolvable id: the note, no site', () => {
    const line = lineOf(row({}), new Map());
    assert.match(line, /חברה: לא ידועה/);
    assert.ok(!line.includes('למשוך'));
  });

  it('row that names its company, and a collected row: no note', () => {
    assert.doesNotMatch(lineOf(row({ name: `${STUDY_FUND} — הראל`, type_key: 'study_fund' })), /חברה: לא ידועה/);
    assert.doesNotMatch(lineOf(row({ status: 'collected' })), /חברה: לא ידועה/);
  });
});

describe('companyRename / companyAppearsInQuote', () => {
  it('a recognised company takes the table label; an unknown one the client text, capped', () => {
    assert.deepEqual(companyRename(PENSION, 'מגדל'), { companyKey: 'migdal', newName: `${PENSION} — מגדל` });
    assert.deepEqual(companyRename(PENSION, 'הראל פנסיה וגמל'), { companyKey: 'harel', newName: `${PENSION} — הראל` });
    const unknown = companyRename(PENSION, '  זמיר   בע"מ ');
    assert.equal(unknown.companyKey, null);
    assert.equal(unknown.newName, `${PENSION} — זמיר בע"מ`);
    assert.equal(companyRename(PENSION, 'x'.repeat(100)).newName.length, PENSION.length + 3 + 60);
  });

  it('the company must be written in the quote, prefix letters allowed', () => {
    assert.equal(companyAppearsInQuote('מגדל', 'הפנסיה שלי במגדל'), true);
    assert.equal(companyAppearsInQuote('מגדל', 'כן, אשלח'), false);
    assert.equal(companyAppearsInQuote('', 'הפנסיה שלי במגדל'), false);
  });
});

describe('the set_company gate (validate_message)', () => {
  const QUOTES: [string, string][] = [
    ['msg-1', 'הפנסיה שלי במגדל'],
    ['msg-2', 'הקרן בחברת זמיר'],
    ['msg-3', 'כן, אשלח'],
    ['msg-4', 'יש לי קרן השתלמות בהראל וגם במיטב'],
  ];
  const intake: IntakeDecisionState = {
    resolvable: [],
    typedRows: [
      { id: 'doc-pension', name: PENSION, status: 'pending', typeKey: 'pension_provident', multiInstance: true },
      { id: 'doc-sf', name: STUDY_FUND, status: 'pending', typeKey: 'study_fund', multiInstance: true },
      { id: 'doc-harel', name: `${STUDY_FUND} — הראל`, status: 'pending', typeKey: 'study_fund', multiInstance: true },
      { id: 'doc-collected', name: PENSION, status: 'collected', typeKey: 'pension_provident', multiInstance: true },
      { id: 'doc-contract', name: 'חוזה רכישה — דירה', status: 'pending', typeKey: 'real_estate', multiInstance: true },
    ],
    inboundTexts: new Map(QUOTES),
    allSettled: false,
    attestationRequested: false,
    confirmableMessageIds: new Set(),
    attestationConfirmed: false,
  };
  const ctx: DecisionContext = { windowOpen: true, templates: [], intake };
  const raw = (overrides: Partial<DecisionResponse>): DecisionResponse => ({
    decision: 'follow_up',
    reasoning: 'test',
    collected_document_ids: [],
    matched_files: [],
    whatsapp_text: 'תוכן',
    whatsapp_template: null,
    send_at: 'asap',
    document_fetch_action: null,
    document_fetch_provider: null,
    document_fetch_document_keys: null,
    resolved_documents: null,
    added_instances: null,
    retired_documents: null,
    stated_costs: [],
    stated_vehicles: [],
    attestation: null,
    attestation_evidence: null,
    ...overrides,
  });
  const set = (document_id: string, company: string, message_id: string, quote: string) => ({ document_id, company, evidence: { message_id, quote } });
  const rejected = (calls: ReturnType<typeof callsOf>, pattern: RegExp, failedCheck: string) =>
    assert.throws(
      () => gateDecision(calls, ctx),
      (err: unknown) => {
        assert.ok(err instanceof DecisionRejectedError);
        assert.match(err.message, pattern);
        // One business_rules entry per call since the tool loop: the refused call's entry is the failed one.
        const failed = err.checks.find((c) => c.key === failedCheck && c.passed === false);
        assert.ok(failed, `check ${failedCheck} reported as failed`);
        return true;
      },
    );

  it('recognised company: the row is renamed with the table label and the checks are reported', () => {
    const { decision, checks } = gateDecision(callsOf(raw({ set_companies: [set('doc-pension', 'מגדל', 'msg-1', 'הפנסיה שלי במגדל')] })), ctx);
    assert.deepEqual(decision.setCompanies, [
      {
        documentId: 'doc-pension',
        oldName: PENSION,
        companyText: 'מגדל',
        companyKey: 'migdal',
        newName: `${PENSION} — מגדל`,
        evidence: { message_id: 'msg-1', quote: 'הפנסיה שלי במגדל' },
      },
    ]);
    assert.deepEqual(
      checks.map((c) => [c.key, c.passed, c.observed]),
      [
        ['tool_calls', true, '2 calls: set_company, send_whatsapp_text'],
        ['set_company_row_allows', true, `"${PENSION}", status pending`],
        ['set_company_in_quote', true, 'הפנסיה שלי במגדל'],
        ['set_company_recognised', true, 'migdal'],
        ['business_rules', true, 'set_company — document_id: doc-pension, company: מגדל'],
        ['business_rules', true, 'send_whatsapp_text — send_at: asap, text: 4 chars'],
        ['ending', true, 'send_whatsapp_text'],
      ],
    );
  });

  it('company not in the table: renamed with the client text, observed "not in table"', () => {
    const { decision, checks } = gateDecision(callsOf(raw({ set_companies: [set('doc-sf', 'זמיר', 'msg-2', 'הקרן בחברת זמיר')] })), ctx);
    assert.equal(decision.setCompanies[0]!.newName, `${STUDY_FUND} — זמיר`);
    assert.equal(decision.setCompanies[0]!.companyKey, null);
    assert.equal(checks.find((c) => c.key === 'set_company_recognised')!.observed, 'not in table');
  });

  it('two companies for one row: set_company for the first, add_instance for the second', () => {
    const { decision } = gateDecision(
      callsOf(
        raw({
          set_companies: [set('doc-sf', 'הראל', 'msg-4', 'יש לי קרן השתלמות בהראל וגם במיטב')],
          added_instances: [
            {
              anchor_document_id: 'doc-sf',
              instances: [
                {
                  name: 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מיטב',
                  description: null,
                  already_provided: false,
                  file_ids: [],
                  paper_key: '',
                  stated_cost: { amount: 0, currency: '', message_id: '', quote: '' },
                  stated_vehicle: { manufacturer: '', model: '', production_year: 0, license_plate: '', purchase_cost: 0, currency: '', message_id: '', quote: '' },
                },
              ],
              evidence: { message_id: 'msg-4', quote: 'יש לי קרן השתלמות בהראל וגם במיטב' },
              proven_by_file_id: '',
            },
          ],
        }),
      ),
      ctx,
    );
    assert.equal(decision.setCompanies[0]!.newName, `${STUDY_FUND} — הראל`);
    assert.equal(decision.addedInstances[0]!.instances[0]!.name, 'אישור יתרת קרן השתלמות ליום 31.12.2025 — מיטב');
  });

  it('row already names a company', () => {
    rejected(callsOf(raw({ set_companies: [set('doc-harel', 'מגדל', 'msg-1', 'הפנסיה שלי במגדל')] })), /already names a company/, 'set_company_row_allows');
  });

  it('quote without the company', () => {
    rejected(callsOf(raw({ set_companies: [set('doc-pension', 'מגדל', 'msg-3', 'כן, אשלח')] })), /not written in the quote/, 'set_company_in_quote');
  });

  it('row not pending, a row of another type, an unknown row', () => {
    rejected(callsOf(raw({ set_companies: [set('doc-collected', 'מגדל', 'msg-1', 'הפנסיה שלי במגדל')] })), /only a pending row/, 'set_company_row_allows');
    rejected(callsOf(raw({ set_companies: [set('doc-contract', 'מגדל', 'msg-1', 'הפנסיה שלי במגדל')] })), /institution-bound/, 'set_company_row_allows');
    rejected(callsOf(raw({ set_companies: [set('doc-nope', 'מגדל', 'msg-1', 'הפנסיה שלי במגדל')] })), /not an already-resolved/, 'set_company_row_allows');
  });

  it('a quote that is not in the message fails the evidence rule (business_rules)', () => {
    rejected(callsOf(raw({ set_companies: [set('doc-pension', 'מגדל', 'msg-1', 'הפנסיה במגדל')] })), /not contained verbatim/, 'business_rules');
  });

  it('the same row twice is rejected', () => {
    const twice = [set('doc-pension', 'מגדל', 'msg-1', 'הפנסיה שלי במגדל'), set('doc-pension', 'הראל', 'msg-4', 'יש לי קרן השתלמות בהראל וגם במיטב')];
    rejected(callsOf(raw({ set_companies: twice })), /twice/, 'business_rules');
  });

  it('a declined answer may not set a company', () => {
    rejected(callsOf(raw({ decision: 'client_declined', whatsapp_text: null, send_at: null, set_companies: [set('doc-pension', 'מגדל', 'msg-1', 'הפנסיה שלי במגדל')] })), /client_declined is the whole run — this run already made a checklist change/, 'business_rules');
  });
});

describe('the renamed row behaves as a row that named the company from the start', () => {
  const renamed = companyRename(PENSION, 'מגדל').newName;

  it('the Migdal pension type matches it and no other provider does', () => {
    for (const spec of listProviderSpecs()) {
      const matches = spec.documents.filter((d) => d.matchesRequiredDocument({ name: renamed })).map((d) => d.key);
      assert.deepEqual(matches, spec.id === 'migdal' ? ['pension_annual'] : [], spec.id);
    }
  });

  it('a Harel report is a different company for it; a Migdal report the same', () => {
    assert.equal(compareCompanies('הראל פנסיה וגמל', renamed).verdict, 'different');
    assert.equal(compareCompanies('מגדל מקפת קרנות פנסיה וקופות גמל', renamed).verdict, 'same');
    assert.equal(compareCompanies('הראל פנסיה וגמל', PENSION).verdict, 'item_unidentified');
  });
});

describe('setCompanyDetail — the set_company step', () => {
  const call = { name: 'set_company' as const, args: { document_id: 'doc-pension', company: 'מגדל', evidence_message_id: 'msg-1', evidence_quote: 'הפנסיה שלי במגדל' } };
  const evidence = { message_id: 'msg-1', quote: 'הפנסיה שלי במגדל' };

  it('records old and new name, the company, its key, the quote and the outcome', () => {
    assert.deepEqual(setCompanyDetail(call, { applied: true, oldName: PENSION, newName: `${PENSION} — מגדל`, companyKey: 'migdal', evidence }), {
      tool: 'set_company',
      documentId: 'doc-pension',
      name: PENSION,
      newName: `${PENSION} — מגדל`,
      company: 'מגדל',
      companyKey: 'migdal',
      quote: 'הפנסיה שלי במגדל',
      applied: true,
      reason: `renamed "${PENSION}" → "${PENSION} — מגדל"`,
    });
  });

  it('a raced row says no change, an unknown company says not in table', () => {
    const d = setCompanyDetail(call, { applied: false, oldName: PENSION, newName: `${PENSION} — זמיר`, companyKey: null, evidence });
    assert.equal(d.reason, 'no change: the row is no longer pending');
    assert.equal(d.companyKey, 'not in table');
  });
});
