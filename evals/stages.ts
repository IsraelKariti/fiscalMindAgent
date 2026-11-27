import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFileScreenCall,
  buildInjectionScreenCall,
  InjectionScreenSchema,
  joinSnippets,
} from '../src/agents/shared/injectionScreen.js';
import { validateInjectionScan } from '../src/agents/shared/injectionScanRules.js';
import { matchInjectionRegex } from '../src/agents/shared/injectionRegex.js';
import { toModelFile, type ModelFile } from '../src/agents/shared/modelFile.js';
import { sanitizeInline, sanitizeUntrusted } from '../src/agents/shared/promptSafety.js';
import { buildFormIntakeCall } from '../src/agents/declarationOfCapital/formIntakeCall.js';
import {
  validateFormResolutions,
  type FormAnswer,
  type FormIntakeResponse,
  type FormResolvableRow,
} from '../src/agents/declarationOfCapital/formIntakeRules.js';
import { CAPITAL_DOCUMENT_CATALOG, getCatalogType } from '../src/agents/declarationOfCapital/catalog.js';
import { approvedPropertyFilesOf, provenFactsLine, provenFactsOf } from '../src/agents/declarationOfCapital/provenFacts.js';
import { selfEvidentFilesOf } from '../src/agents/declarationOfCapital/selfEvidentFiles.js';
import { readSpouse } from '../src/agents/declarationOfCapital/spouseIdentity.js';
import { buildAnalysisCall } from '../src/agents/declarationOfCapital/analyzeFile.js';
import { CapitalFileAnalysisSchema, validateClassification, type FileAnalysis } from '../src/agents/declarationOfCapital/analyzeFileRules.js';
import { identifyInstitution } from '../src/agents/declarationOfCapital/institutions.js';
import { cleanEmployer } from '../src/agents/declarationOfCapital/splitChildNames.js';
import { buildFileSplitCall } from '../src/agents/declarationOfCapital/splitFile.js';
import { FileSplitSchema, validateFileSplit, type FileSplit } from '../src/agents/declarationOfCapital/splitFileRules.js';
import { readPdfPageCount } from '../src/agents/declarationOfCapital/pdfPages.js';
import { buildExtractionCall, documentTypeSpec } from '../src/agents/declarationOfCapital/extractionCall.js';
import {
  normalizeIdNumber,
  partyInputs,
  typeFieldValue,
  type ExtractedAnswer,
} from '../src/agents/declarationOfCapital/verifyChecks.js';
import { resolveDocumentOwners } from '../src/agents/declarationOfCapital/spouseIdentity.js';
import { buildDecisionCall } from '../src/agents/declarationOfCapital/decide.js';
import { allowedDocumentFetchActions, type DecisionContext, type IntakeDecisionState } from '../src/agents/declarationOfCapital/decisionSchema.js';
import { judgeRun, type RunEndingKind } from '../src/agents/declarationOfCapital/decisionJudge.js';
import {
  buildPrompt,
  type IntakePromptInput,
  type DocumentFetchPromptInput,
  type VerificationResultPromptInput,
  type WaChannelState,
} from '../src/agents/declarationOfCapital/prompt.js';
import { getProviderSpec } from '../src/agents/declarationOfCapital/documentFetch/providers.js';
import { rowCompanyUnknown, sitesForUnnamedRow } from '../src/agents/declarationOfCapital/companyClarification.js';
import { env } from '../src/config/env.js';
import { zonedTimeToUtc } from '../src/util/time.js';
import type { LlmCallPurpose } from '../src/gemini/modelCatalog.js';
import type { LlmCallSpec, LlmToolCall } from '../src/gemini/llmCall.js';
import { isTerminalTool, toolsForContext } from '../src/agents/declarationOfCapital/decisionTools.js';
type ToolCall = LlmToolCall;
import type {
  ClientDocumentRow,
  ClientRow,
  DocumentFileRow,
  DocumentStatus,
  EmailRow,
  TeamQuestionRow,
  UserRow,
  WaTemplatePurpose,
  WaTemplateRow,
} from '../src/db/types.js';
import { splitTemplatesByPurpose } from '../src/agents/declarationOfCapital/templatePurpose.js';

/**
 * One adapter per LLM stage: how a case becomes the exact runLlmCall() spec
 * the app would send (through the same build*Call factories the call sites
 * use), how the answer text is parsed (the stage's own zod schema), and how
 * the parsed answer is judged — in code, AFTER the stage's own code gate,
 * never by another model.
 *
 * A judge returns checks: [{ key, expected, actual, pass }]. A case passes when
 * every check passes. `info` carries non-scoring detail for the report.
 */

export interface Check {
  key: string;
  expected: unknown;
  actual: unknown;
  pass: boolean;
}

export interface Judgement {
  checks: Check[];
  info: Record<string, unknown>;
}

export interface BuiltCall {
  spec: LlmCallSpec;
  /** The stage's own parse of the answer (the text of a form stage, the tool calls of the planner) — what gets stored as `output`. */
  parse: (res: { text: string; toolCalls: LlmToolCall[]; texts?: { turn: number; text: string }[]; turns?: number; ended?: string }) => unknown;
}

export interface StageAdapter<C = unknown, Ctx = unknown> {
  purpose: LlmCallPurpose;
  /** The raw case file: `cases` plus the shared context (everything else). */
  load(): { cases: C[] } & Ctx;
  /** Async setup a stage needs before build/judge (both are sync). Callers await it right after loadStage(). */
  prepare?(): Promise<void>;
  build(c: C, ctx: Ctx): BuiltCall;
  judge(c: C, output: unknown, ctx: Ctx): Judgement;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(HERE, 'cases');
const FILES_DIR = path.join(HERE, 'files');

const readCases = <T>(stage: string): T => JSON.parse(fs.readFileSync(path.join(CASES_DIR, `${stage}.json`), 'utf8')) as T;
const readFile = (name: string): Buffer => fs.readFileSync(path.join(FILES_DIR, name));

// What the model reads for a case file (shared/modelFile.ts: a PDF/image as is,
// a spreadsheet rendered to text) — the same as production. Rendered once per
// file in the stage's prepare(), since build/judge are sync.
const modelFiles = new Map<string, ModelFile>();
function modelFileOf(name: string): ModelFile {
  const file = modelFiles.get(name);
  if (!file) throw new Error(`model file of ${name} is unknown — the stage's prepare() did not run`);
  return file;
}
async function prepareModelFiles(stage: string): Promise<void> {
  const { cases } = readCases<{ cases: Array<{ file?: string; contentType?: string }> }>(stage);
  for (const c of cases) {
    if (!c.file || !c.contentType || modelFiles.has(c.file)) continue;
    modelFiles.set(c.file, await toModelFile({ bytes: readFile(c.file), contentType: c.contentType }));
  }
}

/** expected may be a single value or a list of accepted values. */
function eq(key: string, expected: unknown, actual: unknown): Check {
  const accepted = Array.isArray(expected) ? expected : [expected];
  return { key, expected, actual, pass: accepted.some((v) => v === actual) };
}

const digits = (s: string | null | undefined): string => (s ?? '').replace(/\D/g, '');
const dateOrNull = (s: unknown): string | null => (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);
const errorMessage = (err: unknown): string => (err instanceof Error ? err.message : String(err));

// ---------------------------------------------------------------------------
// injection_detection_llm

interface InjectionTextCase {
  id: string;
  kind: 'text';
  /** "<question>: <answer>" strings, exactly what applyFormIntake / the message screen hands to joinSnippets. */
  snippets: string[];
  expected: { suspected_injection: boolean };
  notes?: string;
}
interface InjectionFileCase {
  id: string;
  kind: 'file';
  file: string;
  contentType: string;
  filename: string;
  expected: { suspected_injection: boolean };
  notes?: string;
}
type InjectionCase = InjectionTextCase | InjectionFileCase;

/** A text layer this short cannot be checked fairly — the same threshold screenFileForInjection uses. */
const MIN_CHECKABLE_TEXT = 40;

const textSnippets = (c: InjectionTextCase): string[] => c.snippets.map((s) => sanitizeUntrusted(s, 4300));

const injectionScreen: StageAdapter<InjectionCase, Record<string, unknown>> = {
  purpose: 'injection_detection_llm',
  load: () => readCases('injection_detection_llm'),
  prepare: () => prepareModelFiles('injection_detection_llm'),
  build(c) {
    const spec =
      c.kind === 'file'
        ? buildFileScreenCall({ bytes: modelFileOf(c.file).bytes, contentType: modelFileOf(c.file).contentType, filename: c.filename })
        : buildInjectionScreenCall(joinSnippets(textSnippets(c)));
    return { spec, parse: (res) => InjectionScreenSchema.parse(JSON.parse(res.text)) };
  },
  judge(c, output) {
    const raw = output as { suspected_injection: boolean; evidence: string | null };
    let text: string | null;
    let regexInput: string;
    if (c.kind === 'file') {
      const layer = modelFileOf(c.file).text;
      text = layer.length >= MIN_CHECKABLE_TEXT ? layer : null;
      regexInput = `${c.filename}\n${layer}`;
    } else {
      text = joinSnippets(textSnippets(c));
      regexInput = textSnippets(c).join('\n');
    }
    const gate = validateInjectionScan(raw, text);
    // In the app a regex hit short-circuits BEFORE this LLM call; here it is reported, not judged.
    const regex = matchInjectionRegex(regexInput);
    return {
      checks: [eq('suspected_injection', c.expected.suspected_injection, raw.suspected_injection)],
      info: {
        gate: { result: gate.result, reason: gate.reason, verbatimChecked: gate.verbatimChecked },
        evidence: raw.evidence,
        regexWouldCatch: regex !== null,
        regexKind: regex?.kind ?? null,
        textLayerChars: c.kind === 'file' ? (text?.length ?? 0) : null,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// questionnaire_schema_mapping

interface FormIntakeCase {
  id: string;
  /** One string per ctx.questions entry, in order; '' = left blank. */
  answers: string[];
  expected: {
    verdicts: Record<string, 'required' | 'not_required' | 'unclear' | Array<'required' | 'not_required' | 'unclear'>>;
    /** Per required type: one lower-case substring per expected instance name ('' = any name). */
    instances?: Record<string, string[]>;
    dropped?: number;
  };
  notes?: string;
}
interface FormIntakeCtx {
  taxYear: number;
  /** The monday WorkForm's questions (column titles), in the order `answers` follow. */
  questions: string[];
}

/** Exactly what applyFormIntake does with the submitted form, over the whole catalog (a fresh client). */
function formAnswers(c: FormIntakeCase, ctx: FormIntakeCtx) {
  const answers: FormAnswer[] = ctx.questions
    .map((q, i) => ({ question: sanitizeInline(q, 300), answer: sanitizeUntrusted(c.answers[i] ?? '', 4000) }))
    .filter((a) => a.question !== '');
  const rows: FormResolvableRow[] = CAPITAL_DOCUMENT_CATALOG.map((t) => ({ id: `doc_${t.key}`, typeKey: t.key, multiInstance: t.multiInstance }));
  return {
    answers,
    answered: answers.filter((a) => a.answer !== ''),
    emptyQuestions: answers.filter((a) => a.answer === '').map((a) => a.question),
    rows,
  };
}

const formIntake: StageAdapter<FormIntakeCase, FormIntakeCtx> = {
  purpose: 'questionnaire_schema_mapping',
  load: () => readCases('questionnaire_schema_mapping'),
  build(c, ctx) {
    const { answered, emptyQuestions, rows } = formAnswers(c, ctx);
    const { spec, schema } = buildFormIntakeCall({ answered, emptyQuestions, rows, taxYear: ctx.taxYear });
    return { spec, parse: (res) => schema.parse(JSON.parse(res.text)) };
  },
  judge(c, output, ctx) {
    const data = output as FormIntakeResponse;
    const { answers, rows } = formAnswers(c, ctx);
    const { valid, dropped, unclear } = validateFormResolutions(data, rows, answers);
    const checks: Check[] = [];
    for (const [typeKey, expected] of Object.entries(c.expected.verdicts)) {
      checks.push(eq(`verdict.${typeKey}`, expected, data.verdicts[typeKey]));
    }
    for (const [typeKey, wanted] of Object.entries(c.expected.instances ?? {})) {
      const accepted = valid.find((v) => v.typeKey === typeKey && v.resolution === 'required');
      const names = accepted && accepted.resolution === 'required' ? accepted.instances.map((i) => i.name) : [];
      checks.push(eq(`instances.${typeKey}.count`, wanted.length, names.length));
      // Every wanted substring must sit in a distinct instance name.
      const pool = names.map((n) => n.toLowerCase());
      const missing: string[] = [];
      for (const sub of wanted) {
        const at = pool.findIndex((n) => n.includes(sub.toLowerCase()));
        if (at === -1) missing.push(sub);
        else pool.splice(at, 1);
      }
      checks.push({ key: `instances.${typeKey}.names`, expected: wanted, actual: names, pass: missing.length === 0 });
    }
    checks.push(eq('dropped', c.expected.dropped ?? 0, dropped.length));
    return {
      checks,
      info: {
        dropped,
        unclear,
        accepted: valid.map((v) => ({
          typeKey: v.typeKey,
          resolution: v.resolution,
          ...(v.resolution === 'required' ? { instances: v.instances.map((i) => i.name) } : { evidence: v.evidence }),
        })),
      },
    };
  },
};

// ---------------------------------------------------------------------------
// file_splitting

interface SplitFileCase {
  id: string;
  file: string;
  filename: string;
  expected: {
    /** The accepted ranges as text ("1-3, 4-5"); a list means any of these is accepted. */
    ranges: string | string[];
  };
  notes?: string;
}

/**
 * The page count is read by code from the PDF, exactly like the call site does
 * — never taken from the case file. The PDF library only loads asynchronously,
 * so `prepare()` resolves every case file's count once before build/judge run.
 */
const splitPageCounts = new Map<string, number>();
function splitPageCount(name: string): number {
  const count = splitPageCounts.get(name);
  if (count === undefined) throw new Error(`page count of ${name} is unknown — the stage's prepare() did not run`);
  return count;
}

const splitFileStage: StageAdapter<SplitFileCase, Record<string, never>> = {
  purpose: 'file_splitting',
  load: () => readCases('file_splitting'),
  async prepare() {
    const { cases } = readCases<{ cases: SplitFileCase[] }>('file_splitting');
    for (const c of cases) {
      if (!splitPageCounts.has(c.file)) splitPageCounts.set(c.file, await readPdfPageCount(readFile(c.file)));
    }
  },
  build(c) {
    const spec = buildFileSplitCall({ bytes: readFile(c.file), filename: c.filename, pageCount: splitPageCount(c.file) });
    return { spec, parse: (res) => FileSplitSchema.parse(JSON.parse(res.text)) };
  },
  judge(c, output) {
    const raw = output as FileSplit;
    const pageCount = splitPageCount(c.file);
    const gate = validateFileSplit(raw, pageCount);
    const proposed = gate.proposed.map((r) => `${r.from}-${r.to}`).join(', ');
    const checks: Check[] = [
      // Every case is a well-formed file: a rejected answer is a model failure.
      eq('gate_result', true, gate.result),
      eq('ranges', c.expected.ranges, gate.result ? gate.ranges.map((r) => `${r.from}-${r.to}`).join(', ') : null),
    ];
    return {
      checks,
      info: {
        gate: { result: gate.result, reason: gate.reason, failed: gate.checks.filter((k) => k.passed === false).map((k) => k.key) },
        pageCount,
        proposed,
        kinds: raw.documents.map((d) => d.kind),
      },
    };
  },
};

// ---------------------------------------------------------------------------
// file_classification

interface AnalyzeFileCase {
  id: string;
  file: string;
  contentType: string;
  filename: string;
  expected: {
    document_type?: string | (string | null)[];
    /** The paper after the gate (openspec `document-papers`); null = none. */
    document_paper?: string | null | (string | null)[];
    matched_document_id?: string | null | (string | null)[];
    legible?: boolean;
    injection_suspected?: boolean;
    /** document_kind must contain one of these (case-insensitive). */
    document_kind_any?: string[];
    /** The institutions-table key code identifies from the answer's issuer_name (null = none identified). */
    issuer_key?: string | null;
    /** How many accounts / policies the answer's holdings list must hold (after the gate's type filter). */
    holdings_count?: number;
    /**
     * The holders of the list, in any order: a string (or one of a list of accepted spellings) must be
     * contained in some entry's holder_name, null stands for one entry with no readable name. The
     * number of nulls must be exact.
     */
    holdings_holders?: (string | string[] | null)[];
    /** The employer of the fund after cleanEmployer (employer-bound types only; null = none printed / not kept by the gate). */
    employer?: string | null;
  };
  notes?: string;
}
interface ChecklistRow {
  id: string;
  name: string;
  description: string | null;
  type_key: string | null;
  /** The paper the item stands for (openspec `document-papers`); omitted = none. */
  paper_key?: string | null;
}
interface AnalyzeFileCtx {
  taxYear: number;
  checklist: ChecklistRow[];
}

const analyzeFile: StageAdapter<AnalyzeFileCase, AnalyzeFileCtx> = {
  purpose: 'file_classification',
  load: () => readCases('file_classification'),
  prepare: () => prepareModelFiles('file_classification'),
  build(c, ctx) {
    const spec = buildAnalysisCall({
      bytes: modelFileOf(c.file).bytes,
      contentType: modelFileOf(c.file).contentType,
      filename: c.filename,
      requiredDocuments: ctx.checklist,
      taxYear: ctx.taxYear,
    });
    return { spec, parse: (res) => CapitalFileAnalysisSchema.parse(JSON.parse(res.text)) };
  },
  judge(c, output, ctx) {
    const raw = output as FileAnalysis;
    const gate = validateClassification(raw, ctx.checklist);
    const a = gate.analysis;
    const checks: Check[] = [];
    const e = c.expected;
    if (e.document_type !== undefined) checks.push(eq('document_type', e.document_type, a.document_type ?? null));
    if (e.document_paper !== undefined) checks.push(eq('document_paper', e.document_paper, a.document_paper ?? null));
    if (e.matched_document_id !== undefined) checks.push(eq('matched_document_id', e.matched_document_id, a.matched_document_id));
    if (e.legible !== undefined) checks.push(eq('legible', e.legible, a.legible));
    if (e.injection_suspected !== undefined) checks.push(eq('injection_suspected', e.injection_suspected, a.injection_suspected));
    if (e.issuer_key !== undefined) checks.push(eq('issuer_key', e.issuer_key, identifyInstitution(raw.issuer_name)));
    if (e.holdings_count !== undefined) checks.push(eq('holdings_count', e.holdings_count, a.holdings?.length ?? 0));
    if (e.employer !== undefined) checks.push(eq('employer', e.employer, cleanEmployer(a.employer_name)));
    if (e.holdings_holders) {
      const holders = (a.holdings ?? []).map((h) => h.holder_name);
      const named = e.holdings_holders.filter((h): h is string | string[] => h !== null).map((h) => (Array.isArray(h) ? h : [h]));
      const hidden = e.holdings_holders.length - named.length;
      checks.push({
        key: 'holdings_holders',
        expected: e.holdings_holders,
        actual: holders,
        pass: holders.filter((h) => h === null).length === hidden && named.every((spellings) => holders.some((h) => h !== null && spellings.some((n) => h.includes(n)))),
      });
    }
    if (e.document_kind_any) {
      const kind = (a.document_kind ?? '').toLowerCase();
      checks.push({
        key: 'document_kind',
        expected: e.document_kind_any,
        actual: a.document_kind,
        pass: e.document_kind_any.some((k) => kind.includes(k.toLowerCase())),
      });
    }
    return {
      checks,
      info: {
        gate: { result: gate.result, reason: gate.reason, rejectedId: gate.rejectedId, quarantined: gate.quarantined },
        confidence: a.confidence,
        proposedMatch: raw.matched_document_id,
        issuer_name: raw.issuer_name ?? null,
        match_dropped: a.match_dropped ?? null,
        holdings: a.holdings ?? null,
        tax_year: a.tax_year,
        subject_name: a.subject_name,
        summary: a.summary,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// extract_document

interface VerifyDocumentCase {
  id: string;
  file: string;
  contentType: string;
  filename: string;
  doc: { type_key: string | null; name: string; description: string | null };
  client: {
    name: string;
    idNumber: string | null;
    /** The one spouse on file (openspec `spouse-identity`); absent = nothing known. */
    spouse?: { name: string | null; idNumber: string | null } | null;
    maritalStatus?: 'married' | 'not_married' | null;
  };
  expected: {
    is_expected_type?: boolean;
    legible?: boolean;
    injection_suspected?: boolean;
    as_of_date?: string | null | (string | null)[];
    valid_until?: string | null | (string | null)[];
    /** The ids printed beside the OWNER parties (digits; order-free; every owner id, none of the counterparties'). */
    owner_ids?: string[];
    /** The app's identity rule (resolveDocumentOwners) accepts the document for the client or the spouse. */
    subject_name_matches?: boolean;
    amount?: { value: number; currency: string };
    /**
     * The type's own extraction fields (documentTypes/<type>.ts `fields`), by key: a number
     * within 0.005, a date after the same normalisation as as_of_date, text
     * and years exactly; null must come back null. Unlisted keys are not judged.
     */
    fields?: Record<string, string | number | null | (string | number | null)[]>;
    /** What the type's verify() must decide; every key in failed_keys must be among the failures; adopted = a spouse is adopted from this document. */
    verdict?: { passed: boolean; failed_keys?: string[]; adopted?: boolean };
  };
  notes?: string;
}
interface VerifyDocumentCtx {
  taxYear: number;
  /** Verification time (ISO) — the verification context's "now". */
  now: string;
}

const verifyDocument: StageAdapter<VerifyDocumentCase, VerifyDocumentCtx> = {
  purpose: 'extract_document',
  load: () => readCases('extract_document'),
  prepare: () => prepareModelFiles('extract_document'),
  build(c, ctx) {
    const spec = buildExtractionCall({
      doc: c.doc,
      bytes: modelFileOf(c.file).bytes,
      contentType: modelFileOf(c.file).contentType,
      filename: c.filename,
      taxYear: ctx.taxYear,
    });
    return { spec, parse: (res) => documentTypeSpec(c.doc.type_key).schema.parse(JSON.parse(res.text)) };
  },
  judge(c, output, ctx) {
    const data = output as ExtractedAnswer;
    const e = c.expected;
    const checks: Check[] = [];
    const type = documentTypeSpec(c.doc.type_key);
    const typeFields = type.fields;
    if (e.is_expected_type !== undefined) checks.push(eq('is_expected_type', e.is_expected_type, data.is_expected_type));
    if (e.legible !== undefined) checks.push(eq('legible', e.legible, data.legible));
    if (e.injection_suspected !== undefined) checks.push(eq('injection_suspected', e.injection_suspected, data.injection_suspected));
    // Models put "" or "/" where the schema says null; the checks read only well-formed dates, so judge the same way.
    if (e.as_of_date !== undefined) checks.push({ ...eq('as_of_date', e.as_of_date, dateOrNull(data.as_of_date)), actual: data.as_of_date });
    if (e.valid_until !== undefined) checks.push({ ...eq('valid_until', e.valid_until, dateOrNull(data.valid_until)), actual: data.valid_until });
    const spouseOnFile = c.client.spouse
      ? { name: c.client.spouse.name, idNumber: c.client.spouse.idNumber, nameSource: 'questionnaire' as const, idSource: 'questionnaire' as const }
      : { name: null, idNumber: null, nameSource: null, idSource: null };
    const parties = partyInputs(data.parties);
    if (e.owner_ids !== undefined) {
      const got = parties.filter((p) => p.role === 'owner' && p.printedId !== '').map((p) => p.printedId).sort();
      const want = e.owner_ids.map((id) => normalizeIdNumber(id)).sort();
      checks.push({ key: 'owner_ids', expected: want, actual: got, pass: want.length === got.length && want.every((id, i) => id === got[i]) });
    }
    if (e.subject_name_matches !== undefined) {
      // The app's own identity rule over the owner parties (openspec `spouse-identity`): the document is
      // accepted when any owner is the client or the spouse, by id or by (loosely matched) name, or is adopted.
      const identity = resolveDocumentOwners(parties, {
        clientName: c.client.name,
        clientId: normalizeIdNumber(c.client.idNumber),
        clientIdSource: null,
        spouse: spouseOnFile,
        maritalStatus: c.client.maritalStatus ?? null,
        subjectMatch: true,
      });
      checks.push({ key: 'subject_name_matches', expected: e.subject_name_matches, actual: data.parties, pass: (identity.matched !== null) === e.subject_name_matches });
    }
    // The type's own fields, read the way the type_fields check reads them (typeFieldValue).
    for (const [key, wanted] of Object.entries(e.fields ?? {})) {
      const field = typeFields.find((f) => f.key === key);
      if (!field) {
        checks.push({ key: `fields.${key}`, expected: wanted, actual: undefined, pass: false });
        continue;
      }
      const got = typeFieldValue(data, field);
      const matches = (want: string | number | null): boolean =>
        want === null
          ? got === null
          : field.kind === 'number' || field.kind === 'year'
            ? typeof got === 'number' && typeof want === 'number' && Math.abs(got - want) <= (field.kind === 'number' ? 0.005 : 0)
            : field.kind === 'date'
              ? dateOrNull(got) === want
              : got === want;
      const pass = Array.isArray(wanted) ? wanted.some(matches) : matches(wanted);
      checks.push({ key: `fields.${key}`, expected: wanted, actual: data[key], pass });
    }
    // The deterministic verdict the app would reach with these fields (extract_document's code half).
    const verdict = type.verify(data, {
      clientName: c.client.name,
      credentialIdNumber: c.client.idNumber ?? null,
      spouse: spouseOnFile,
      maritalStatus: c.client.maritalStatus ?? null,
      taxYear: ctx.taxYear,
      now: new Date(ctx.now),
      documentName: c.doc.name,
    });
    const failedKeys = verdict.checks.filter((x) => x.passed === false).map((x) => x.key);
    if (e.verdict) {
      checks.push(eq('verdict.passed', e.verdict.passed, verdict.passed));
      if (e.verdict.failed_keys) {
        checks.push({
          key: 'verdict.failed_keys',
          expected: e.verdict.failed_keys,
          actual: failedKeys,
          pass: e.verdict.failed_keys.every((k) => failedKeys.includes(k)),
        });
      }
      if (e.verdict.adopted !== undefined) checks.push(eq('verdict.adopted', e.verdict.adopted, verdict.adoptSpouse !== null));
    }
    return {
      checks,
      info: {
        verdict: { passed: verdict.passed, failedKeys, reasons: verdict.reasons, subjectMatched: verdict.subjectMatched, adopted: verdict.adoptSpouse !== null },
        actual_kind: data.actual_kind,
        issuer: data.issuer,
        parties: data.parties,
      },
    };
  },
};

// ---------------------------------------------------------------------------
// planner (declaration of capital, WhatsApp-only)

interface DecideDocumentInput {
  id?: string;
  type_key: string | null;
  /** The paper of the type (openspec `document-papers`); omitted = none. */
  paper_key?: string | null;
  status: DocumentStatus;
  name?: string;
  description?: string | null;
  verification?: Record<string, unknown> | null;
}
interface DecideMessageInput {
  id: string;
  direction: 'inbound' | 'outbound';
  body: string;
  /** ISO instant the message was sent/received. */
  at: string;
  channel?: 'email' | 'whatsapp';
  wa_content_sid?: string | null;
  wa_content_variables?: string[] | null;
}
/** A file the client sent, as the planner sees it: stored, analysed, attached to nothing unless `linked_document_id` is set. */
interface DecideFileInput {
  id: string;
  /** The inbound thread message the file arrived on. */
  message_id: string;
  filename?: string;
  document_kind: string;
  document_type: string;
  issuer_name?: string | null;
  summary?: string;
  matched_document_id?: string | null;
  /** The gate's note when it cancelled a proposed match (company check). */
  match_dropped?: string | null;
  linked_document_id?: string | null;
  /** The name on the file; default the client's name, null = no readable name. */
  subject_name?: string | null;
  /** The accounts / policies the file check listed (openspec confirm-file-findings); absent = an analysis without the list. */
  holdings?: { product: string; holder_name: string | null; account_number: string | null }[];
  /** The employer printed on a fund report (openspec unlisted-files, employer split); absent = none. */
  employer_name?: string | null;
  /** The classifier's confidence; default high. */
  confidence?: 'high' | 'medium' | 'low';
}
/** One of the agent's own replies that never reached the client (plan.ts: listUnsentDraftsForClient). */
interface DecideUnsentDraftInput {
  body: string;
  /** ISO instant the draft was written. */
  at: string;
  /** true = parked for admin review; default = replaced by a newer plan. */
  held?: boolean;
}
interface DecideCase {
  id: string;
  /** ISO instant "now" — every date in the prompt (and the send_at check) derives from it. */
  now: string;
  taxYear?: number;
  client: {
    name: string;
    wa_phone: string;
    /** ISO instant the engagement started. */
    created_at: string;
    agent_fields?: Record<string, unknown>;
  };
  wa: {
    windowOpen: boolean;
    /** ISO instant; null when the window is closed. */
    windowClosesAt: string | null;
    /** Names of ctx.templates offered to the model. */
    templates: string[];
  };
  /** Explicit rows; every catalog type not listed is seeded 'unresolved' (a fresh client) unless seedCatalog is false. */
  documents: DecideDocumentInput[];
  seedCatalog?: boolean;
  thread: DecideMessageInput[];
  /** Received files shown under their inbound message, each with its content-analysis line. */
  files?: DecideFileInput[];
  /** Shown to the model in the UNSENT DRAFTS block, oldest first; never part of the thread. */
  unsent_drafts?: DecideUnsentDraftInput[];
  /**
   * Fetch providers shown in the DOCUMENT FETCH block (credentials on file). Per-document status is derived from the
   * checklist like the app does (documentFetch/flow.ts); the client counts as live on WhatsApp when the window is open.
   */
  document_fetch?: { provider: string; state: string }[];
  /**
   * Fetch providers whose login identity resolves for the client (openspec `item-company-clarification`): like
   * documentFetch/flow.ts, a pending row that names no company lists the sites among these that would fetch it once it
   * names their company ("חברה: לא ידועה" line).
   */
  fetch_credentials?: string[];
  /**
   * Follow-up cycle after a verification batch: the verdicts that just landed, shown in the VERIFICATION RESULTS
   * block. The reasons come from the row's `verification.reasons`, like in the app.
   */
  verification_results?: { document_id: string; file_name: string; outcome: 'approved' | 'reopened' | 'stalled' | 'skipped' | 'error' }[];
  /**
   * The run after a fetch-delivery batch (openspec `verification-reply`): the VERIFICATION RESULTS block renders
   * even when the batch is empty. Implied true when `verification_results` is given.
   */
  after_verification?: boolean;
  /**
   * The canned result each tool call is answered with in the loop (openspec `planner-answer-tools`): by tool name,
   * or by `<tool>:<document_id>` / `<tool>:<file_id>` for one target. Defaults per tool (a tie is answered
   * "tied · verification: APPROVED", an add_instance names a made-up row id, a send "scheduled"); a refusal is any
   * text starting with "refused: ".
   */
  tool_results?: Record<string, string>;
  attestation?: {
    /** ISO instant the attestation summary was SENT; null = not requested. */
    requestedAt: string | null;
    confirmed?: boolean;
  };
  /**
   * Questions the agent asked the team (openspec `team-questions`), shown in the TEAM QUESTIONS block newest
   * first. An entry without `closed_how` is open — the gate then refuses a second `ask_team`.
   */
  team_questions?: {
    question: string;
    reason?: string;
    to_name: string;
    to_match?: 'accountant' | 'staff';
    asked_at: string;
    evidence_message_id?: string;
    closed_how?: 'answered' | 'handled_outside';
    closed_text?: string;
    closed_at?: string;
    closed_by_name?: string;
  }[];
  expects: {
    /** How the run ends (openspec `planner-answer-tools`): one message, the goal, the decline, or none at all. */
    ending: 'message' | 'goal_complete' | 'client_declined' | 'none';
    /** true: the run ties at least one file (a tie_file / mark_collected, or an instance with file_ids); false: it ties none. */
    ties?: boolean;
    message_kind?: 'freeform' | 'template';
    /** Ids the decision must resolve (exactly this set); an object also pins the resolution per id. */
    resolved_documents?: string[] | Record<string, 'required' | 'not_required'>;
    /** Per resolved id: the exact number of instances. */
    instances?: Record<string, number>;
    /** Catalog type key -> exact number of instances added to that type (exactly this set of types; any row of the type may be the anchor). */
    added_instances?: Record<string, number>;
    /** Exactly the row ids the decision retires (retired_documents). */
    retired_documents?: string[];
    /** true: the decision creates no list item at all (no resolution, no addition, no retirement, no company set) — a file alone never changes the list. */
    no_list_change?: boolean;
    /** Row id -> institutions-table key (null = not in the table): exactly the rows the decision sets a company on (`set_company`, openspec `item-company-clarification`). */
    set_companies?: Record<string, string | null>;
    /** Per resolved id: what the needed resolution rests on — the client's quote, a self-evident file (openspec `unlisted-files`) or an approved property paper. */
    resolution_evidence_source?: Record<string, 'quote' | 'self_evident_file' | 'approved_file'>;
    /** File ids that some newly created instance must name in its file_ids (exactly this set). */
    new_instance_file_ids?: string[];
    /** Exactly the file ids the decision pairs with an existing document (matched_files). */
    matched_file_ids?: string[];
    /** Row id -> amount: exactly the existing items the decision states a chat cost on (stated_costs), with the amount (openspec `chat-stated-cost`). */
    stated_costs?: Record<string, number>;
    /** Exactly the amounts stated on instances the decision creates (an instance's stated_cost), order-free. */
    new_instance_stated_amounts?: number[];
    /** Row id -> facts: exactly the existing vehicle declarations the decision states facts on (stated_vehicles); each listed fact must match, extra stated facts are allowed (openspec `vehicle-declaration`). */
    stated_vehicles?: Record<string, Record<string, string | number>>;
    /** One entry per vehicle-declaration instance the decision creates with a statement (an instance's stated_vehicle): each listed fact must match, extra facts allowed; {} = a statement with any (or no) facts. Order-free. */
    new_instance_stated_vehicles?: Record<string, string | number>[];
    attestation?: 'request' | 'confirmed' | null;
    /** The decision's document-fetch action (null = none), e.g. 'client_agreed'. */
    document_fetch_action?: string | null;
    /** Row id -> substrings that must NOT appear in the message (the row is settled and must not be brought up). */
    no_settled_rows_mentioned?: Record<string, string[]>;
    /** Substrings that must ALL appear in the message. */
    message_includes?: string[];
    /** Substrings that must NOT appear in the message. */
    message_excludes?: string[];
    /** Substrings that must NOT appear inside any question of the message (a sentence ending with a question mark): the agent may state a proven fact, never ask about it. */
    question_excludes?: string[];
    /** At least one of these substrings must appear in the message. */
    message_includes_any?: string[];
    /** Default true for follow_up: the message names 31.12.<taxYear>. */
    mentions_valuation_date?: boolean;
    /** Default 3. */
    max_question_marks?: number;
    /** When set: the answer must (true) / must not (false) carry send_at "asap" (openspec reply-send-asap). */
    send_asap?: boolean;
    /** When set: the answer must (true) / must not (false) ask the team (`ask_team`, openspec `team-questions`). */
    team_question?: boolean;
    /** Substrings that must ALL appear in the question asked to the team. */
    team_question_includes?: string[];
  };
  notes?: string;
}

/** The case's team questions as rows, newest first (openspec `team-questions`). */
function teamQuestionRows(c: DecideCase): TeamQuestionRow[] {
  return (c.team_questions ?? [])
    .map((q, i) => ({
      id: `tq-${i + 1}`,
      client_id: 'client-eval',
      agent_instance_id: 'instance-eval',
      question: q.question,
      reason: q.reason ?? '',
      evidence_message_id: q.evidence_message_id ?? null,
      asked_at: new Date(q.asked_at),
      to_email: 'team@eval.example',
      to_name: q.to_name,
      to_match: q.to_match ?? 'staff',
      closed_how: q.closed_how ?? null,
      closed_text: q.closed_text ?? null,
      closed_at: q.closed_at ? new Date(q.closed_at) : null,
      closed_by: null,
      closed_by_name: q.closed_by_name ?? null,
      created_at: new Date(q.asked_at),
    }))
    .sort((a, b) => b.asked_at.getTime() - a.asked_at.getTime());
}
interface DecideCtx {
  taxYear: number;
  accountant: { name: string; hebrew_name: string | null; email: string };
  templates: Array<{ content_sid: string; name: string; body: string; variable_count: number; purpose?: WaTemplatePurpose }>;
}

const SETTLED_STATUSES = new Set<DocumentStatus>(['not_required', 'approved', 'stated', 'retired', 'claimed', 'collected']);

function clientRow(c: DecideCase): ClientRow {
  const createdAt = new Date(c.client.created_at);
  return {
    id: 'client-eval',
    user_id: 'user-eval',
    agent_instance_id: 'instance-eval',
    agent_fields: { tax_year: c.taxYear ?? null, ...(c.client.agent_fields ?? {}) },
    name: c.client.name,
    email_address: '',
    goal_status: 'pending',
    occupation: null,
    phone: c.client.wa_phone,
    company: null,
    notes: null,
    wa_phone: c.client.wa_phone,
    wa_enabled: true,
    wa_opted_in_at: createdAt,
    wa_opted_in_by: 'accountant',
    wa_opted_out_at: null,
    paused: false,
    admin_paused: false,
    drafting_since: null,
    processing_since: null,
    draft_failed_at: null,
    outage_held_at: null,
    outage_held_provider: null,
    outage_ack_sent_at: null,
    deleted_at: null,
    deleted_by: null,
    is_test: false,
    created_at: createdAt,
    updated_at: createdAt,
  };
}

function accountantRow(ctx: DecideCtx): UserRow {
  const at = new Date('2025-01-01T00:00:00Z');
  return {
    id: 'user-eval',
    google_sub: null,
    email: ctx.accountant.email,
    name: ctx.accountant.name,
    hebrew_name: ctx.accountant.hebrew_name,
    picture_url: null,
    is_admin: false,
    created_at: at,
    updated_at: at,
  };
}

function documentRows(c: DecideCase, taxYear: number): ClientDocumentRow[] {
  const year = String(taxYear);
  const at = new Date(c.client.created_at);
  const explicitKeys = new Set(c.documents.map((d) => d.type_key));
  const seeded: DecideDocumentInput[] =
    c.seedCatalog === false
      ? []
      : CAPITAL_DOCUMENT_CATALOG.filter((t) => !explicitKeys.has(t.key)).map((t) => ({ type_key: t.key, status: 'unresolved' as const }));
  const all = [...seeded, ...c.documents];
  const seenIds = new Set<string>();
  return all.map((d) => {
    const t = d.type_key ? getCatalogType(d.type_key) : undefined;
    const id = d.id ?? `doc-${d.type_key ?? 'adhoc'}`;
    if (seenIds.has(id)) throw new Error(`planner case ${c.id}: duplicate document id ${id} — give explicit ids to sibling rows`);
    seenIds.add(id);
    return {
      id,
      client_id: 'client-eval',
      name: d.name ?? t?.nameHe.replaceAll('{{tax_year}}', year) ?? id,
      description: d.description === undefined ? (t?.descriptionHe.replaceAll('{{tax_year}}', year) ?? null) : d.description,
      status: d.status,
      type_key: d.type_key,
      paper_key: d.paper_key ?? null,
      verification: d.verification ?? null,
      resolution_evidence: null,
      replaced_by: null,
      created_at: at,
      updated_at: at,
    };
  });
}

function threadRows(c: DecideCase): EmailRow[] {
  return c.thread.map((m) => {
    const at = new Date(m.at);
    return {
      id: m.id,
      client_id: 'client-eval',
      direction: m.direction,
      status: m.direction === 'inbound' ? 'received' : 'sent',
      channel: m.channel ?? 'whatsapp',
      message_id: null,
      resend_id: null,
      subject: '',
      body: m.body,
      wa_content_sid: m.wa_content_sid ?? null,
      wa_content_variables: m.wa_content_variables ?? null,
      reasoning: null,
      review_status: null,
      held_at: null,
      blocked: null,
      screen_pending: false,
      plan_trigger: null,
      scheduled_for: null,
      discarded_at: null,
      discard_reason: null,
      plan_run_id: null,
      sent_at: at,
      created_at: at,
    };
  });
}

function unsentDraftRows(c: DecideCase): EmailRow[] {
  return (c.unsent_drafts ?? []).map((d, i) => ({
    id: `draft-${i + 1}`,
    client_id: 'client-eval',
    direction: 'outbound',
    status: d.held ? 'held' : 'draft',
    channel: 'whatsapp',
    message_id: null,
    resend_id: null,
    subject: '',
    body: d.body,
    wa_content_sid: null,
    wa_content_variables: null,
    reasoning: null,
    review_status: d.held ? 'pending' : null,
    plan_trigger: null,
    scheduled_for: null,
    discarded_at: null,
    discard_reason: null,
    plan_run_id: null,
    held_at: d.held ? new Date(d.at) : null,
    blocked: null,
    screen_pending: false,
    sent_at: null,
    created_at: new Date(d.at),
  }));
}

function templateRows(c: DecideCase, ctx: DecideCtx): WaTemplateRow[] {
  return c.wa.templates.map((name) => {
    const t = ctx.templates.find((x) => x.name === name);
    if (!t) throw new Error(`planner case ${c.id}: unknown template "${name}"`);
    return { id: `tpl-${t.name}`, content_sid: t.content_sid, name: t.name, body: t.body, variable_count: t.variable_count, agent_type: 'declaration_of_capital', purpose: t.purpose ?? 'reopen', created_at: new Date('2025-01-01T00:00:00Z') };
  });
}

/** The whole planning input for one snapshot — the same shapes plan.ts assembles from the DB. */
function decideInputs(c: DecideCase, ctx: DecideCtx) {
  const taxYear = c.taxYear ?? ctx.taxYear;
  const now = new Date(c.now);
  const client = clientRow(c);
  const history = threadRows(c);
  const documents = documentRows(c, taxYear);
  const files: DocumentFileRow[] = (c.files ?? []).map((f) => {
    const message = c.thread.find((m) => m.id === f.message_id);
    if (!message) throw new Error(`planner case ${c.id}: file ${f.id} names an unknown message ${f.message_id}`);
    const at = new Date(message.at);
    return {
      id: f.id,
      client_id: 'client-eval',
      email_id: f.message_id,
      client_document_id: f.linked_document_id ?? null,
      provider_attachment_id: `eval-${f.id}`,
      blob_key: `eval/${f.id}`,
      filename: f.filename ?? 'whatsapp-media-1.pdf',
      label: null,
      content_type: 'application/pdf',
      size_bytes: '65000',
      sha256: '0'.repeat(64),
      analysis_status: 'done',
      analysis: {
        document_kind: f.document_kind,
        summary: f.summary ?? f.document_kind,
        tax_year: String(taxYear),
        subject_name: f.subject_name === undefined ? c.client.name : f.subject_name,
        issuer_name: f.issuer_name ?? null,
        ...(f.holdings ? { holdings: f.holdings, holdings_partial: false } : {}),
        ...(f.employer_name !== undefined ? { employer_name: f.employer_name } : {}),
        matched_document_id: f.matched_document_id ?? null,
        match_dropped: f.match_dropped ?? null,
        legible: true,
        confidence: f.confidence ?? 'high',
        injection_suspected: false,
        document_type: f.document_type,
      },
      analyzed_at: at,
      blocked: null,
      parent_file_id: null,
      page_from: null,
      page_to: null,
      created_at: at,
    } as DocumentFileRow;
  });
  // Like plan.ts: intro templates only before the first delivered message, reopen ones after (openspec `whatsapp-templates`).
  const firstContactDone = history.some((m) => m.direction === 'outbound' && m.status === 'sent');
  const { templates, hiddenTemplates } = splitTemplatesByPurpose(templateRows(c, ctx), firstContactDone);
  const waState: WaChannelState = {
    allowed: true,
    unavailableReason: null,
    windowOpen: c.wa.windowOpen,
    windowClosesAt: c.wa.windowClosesAt ? new Date(c.wa.windowClosesAt) : null,
    templates,
    hiddenTemplates,
  };
  const requestedAt = c.attestation?.requestedAt ? new Date(c.attestation.requestedAt) : null;
  const attestationConfirmed = c.attestation?.confirmed === true;
  const inboundTexts = new Map(
    history
      .filter((m) => m.direction === 'inbound')
      .map((m) => [m.id, `${sanitizeInline(m.subject ?? '', 300)}\n${sanitizeUntrusted(m.body, 10_000)}`] as const),
  );
  const intake: IntakeDecisionState = {
    resolvable: documents
      .filter((d) => d.status === 'unresolved' || d.status === 'not_required')
      .map((d) => ({
        id: d.id,
        status: d.status as 'unresolved' | 'not_required',
        typeKey: d.type_key,
        multiInstance: (d.type_key ? getCatalogType(d.type_key)?.multiInstance : undefined) ?? false,
      })),
    typedRows: documents
      .filter((d) => d.type_key !== null && d.status !== 'unresolved' && d.status !== 'not_required')
      .map((d) => ({
        id: d.id,
        name: d.name,
        status: d.status,
        typeKey: d.type_key,
        multiInstance: getCatalogType(d.type_key as string)?.multiInstance ?? false,
        paperKey: d.paper_key,
      })),
    inboundTexts,
    approvedPropertyFiles: approvedPropertyFilesOf(documents),
    // Like plan.ts: a report of a known institution in the client's or spouse's name may create its own item (openspec `unlisted-files`).
    selfEvidentFiles: selfEvidentFilesOf(files, { clientName: client.name, spouse: readSpouse(client.agent_fields) }),
    allSettled: documents.length > 0 && documents.every((d) => d.status === 'approved' || d.status === 'stated' || d.status === 'not_required' || d.status === 'retired'),
    attestationRequested: requestedAt !== null,
    confirmableMessageIds: new Set(
      requestedAt === null ? [] : history.filter((m) => m.direction === 'inbound' && (m.sent_at ?? m.created_at) > requestedAt).map((m) => m.id),
    ),
    attestationConfirmed,
  };
  const intakePrompt: IntakePromptInput = {
    unresolvedCount: intake.resolvable.filter((r) => r.status === 'unresolved').length,
    allSettled: intake.allSettled,
    attestation: attestationConfirmed ? 'confirmed' : requestedAt ? 'requested' : 'none',
  };
  const clientOnWhatsapp = waState.windowOpen && history.some((m) => m.direction === 'inbound');
  const documentFetchPrompt: DocumentFetchPromptInput[] = (c.document_fetch ?? []).map((t) => {
    const spec = getProviderSpec(t.provider);
    return {
      provider: spec.id,
      siteNameHe: spec.siteNameHe,
      otpChannel: spec.otpChannel,
      takesAllDocuments: spec.takesAllDocuments === true,
      state: t.state,
      available: true,
      allowedActions: allowedDocumentFetchActions(t.state, true, clientOnWhatsapp),
      documentTypes: spec.documents.map((type) => {
        const matching = documents.filter((d) => type.matchesRequiredDocument(d));
        return {
          key: type.key,
          descriptionHe: type.documentDescriptionHe,
          pending: matching.some((d) => d.status === 'pending'),
          collected: matching.some((d) => d.status === 'collected'),
        };
      }),
    };
  });
  const decisionCtx: DecisionContext = {
    windowOpen: waState.windowOpen,
    templates,
    hiddenTemplates,
    documentFetch: documentFetchPrompt.map((p) => ({
      provider: p.provider,
      state: p.state,
      available: p.available,
      clientOnWhatsapp,
      documentKeys: p.documentTypes.filter((d) => d.pending).map((d) => d.key),
    })),
    intake,
  };
  const teamQuestions = teamQuestionRows(c);
  const openQuestion = teamQuestions.find((q) => q.closed_at === null);
  decisionCtx.openTeamQuestion = openQuestion ? { id: openQuestion.id, question: openQuestion.question, askedAt: openQuestion.asked_at } : null;
  // Like documentFetch/flow.ts `sitesForUnnamedRows`: the sites a company answer would unlock for each row that names none.
  const usableProviders = (c.fetch_credentials ?? []).map(getProviderSpec);
  const companySites = new Map<string, string[]>();
  for (const d of documents) {
    if (!rowCompanyUnknown(d)) continue;
    const sites = sitesForUnnamedRow(d.name, usableProviders);
    if (sites.length > 0) companySites.set(d.id, sites);
  }
  const afterVerification = c.after_verification === true || c.verification_results !== undefined;
  return { taxYear, now, client, history, documents, files, waState, intakePrompt, documentFetchPrompt, decisionCtx, teamQuestions, companySites, afterVerification };
}

/**
 * The canned executor of the harness (openspec `planner-answer-tools`): no
 * database, so every call is answered with a fixed result text — the case's
 * `tool_results` by tool (or tool + target id), else a default per tool — and
 * the run ends on the first terminal call. What the model does with the
 * results is what the judge then reads off the calls of every turn.
 */
function cannedExecutor(c: DecideCase): (calls: ToolCall[], turn: number) => Promise<{ results: { id?: string; name: string; output: string }[]; ended: boolean }> {
  let created = 0;
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  return async (calls) => {
    let ended = false;
    const results = calls.map((call) => {
      const args = (typeof call.args === 'object' && call.args !== null ? call.args : {}) as Record<string, unknown>;
      const target = str(args.document_id) || str(args.file_id) || str(args.anchor_document_id);
      const canned = c.tool_results?.[`${call.name}:${target}`] ?? c.tool_results?.[call.name];
      let output: string;
      if (canned !== undefined) output = canned;
      else if (call.name === 'tie_file') output = 'tied · verification: APPROVED — the document is closed';
      else if (call.name === 'mark_collected') output = 'collected · verification: APPROVED — the document is closed';
      else if (call.name === 'add_instance') output = `created "${str(args.name)}" — document id eval-row-${++created}`;
      else if (call.name === 'set_required') output = `resolved ${str(args.resolution)}`;
      else if (call.name === 'send_whatsapp_text' || call.name === 'send_whatsapp_template') output = `scheduled ${str(args.send_at)}; the run ended`;
      else if (call.name === 'goal_complete') output = 'goal completed; the run ended';
      else if (call.name === 'client_declined') output = 'the client declined; the run ended';
      else output = 'done';
      if (isTerminalTool(call.name) && !ended && !output.startsWith('refused:')) ended = true;
      return { ...(call.id !== undefined ? { id: call.id } : {}), name: call.name, output };
    });
    return { results, ended };
  };
}

const conversationDecide: StageAdapter<DecideCase, DecideCtx> = {
  purpose: 'planner',
  load: () => readCases('planner'),
  build(c, ctx) {
    const { taxYear, now, client, history, documents, files, waState, intakePrompt, documentFetchPrompt, decisionCtx, teamQuestions, companySites, afterVerification } = decideInputs(c, ctx);
    const accountant = accountantRow(ctx);
    const verificationResults: VerificationResultPromptInput[] = (c.verification_results ?? []).map((r, i) => {
      const doc = documents.find((d) => d.id === r.document_id);
      const reasons = (doc?.verification as { reasons?: unknown } | null)?.reasons;
      // The verified file's id comes from the case's stored record when it names one, so an
      // approved property paper can be cited by `proven_by_file_id` the way the app allows.
      const storedFileId = (doc?.verification as { file_id?: unknown } | null)?.file_id;
      return {
        documentId: r.document_id,
        documentName: doc?.name ?? r.document_id,
        fileId: typeof storedFileId === 'string' && storedFileId !== '' ? storedFileId : `file-eval-${i + 1}`,
        fileName: r.file_name,
        outcome: r.outcome,
        reasons: Array.isArray(reasons) ? reasons.filter((x): x is string => typeof x === 'string') : [],
        provenFacts: doc ? provenFactsLine(provenFactsOf(doc)) : null,
      };
    });
    const prompt = buildPrompt(
      client,
      accountant,
      history,
      documents,
      files,
      now,
      waState,
      documentFetchPrompt,
      taxYear,
      intakePrompt,
      unsentDraftRows(c),
      verificationResults,
      afterVerification,
      null,
      new Map(),
      decisionCtx.intake?.selfEvidentFiles ?? new Map(),
      teamQuestions,
      companySites,
    );
    const { spec } = buildDecisionCall({ systemInstruction: prompt.systemInstruction, contents: prompt.contents, ctx: decisionCtx, execute: cannedExecutor(c) });
    // The planner runs a tool loop (openspec `planner-answer-tools`); the judge reads the calls of every turn with their results.
    return { spec, parse: (res) => ({ calls: res.toolCalls, texts: res.texts, turns: res.turns, ended: res.ended ?? 'terminal' }) };
  },
  judge(c, output, ctx) {
    const { calls, texts, turns, ended: loopEnded } = output as { calls: ToolCall[]; texts?: { turn: number; text: string }[]; turns?: number; ended?: string };
    const { taxYear, now, documents, decisionCtx } = decideInputs(c, ctx);
    const e = c.expects;
    const checks: Check[] = [];
    const info: Record<string, unknown> = { calls: calls.map((k) => k.name), turns: turns ?? 1, loop: loopEnded ?? 'terminal', texts: texts ?? [] };
    info.results = calls.map((k) => ({ tool: k.name, turn: k.turn ?? 1, result: k.result ?? null }));
    // The same judging plan.ts does per turn, over the whole run at once: the shape check, the units, the ties, the team question, the fetch step, the terminal calls.
    const run = judgeRun(calls, decisionCtx, {
      hasDocuments: documents.length > 0,
      allSettled: decisionCtx.intake?.allSettled ?? false,
      attestationConfirmed: decisionCtx.intake?.attestationConfirmed ?? false,
    });
    const decision = run.changes;
    info.refusals = run.refusals.map((r) => `${r.call.name}: ${r.reason}`);
    // The gate: every call accepted (a refusal the model did not recover from in the run counts as a failed case, as the old whole-answer gate did).
    checks.push({ key: 'gate', expected: 'every call accepted', actual: run.refusals.length === 0 ? 'accepted' : run.refusals.map((r) => r.reason.slice(0, 200)), pass: run.refusals.length === 0 });
    const ending: RunEndingKind = run.ending;
    checks.push(eq('ending', e.ending, ending));
    info.reasoning = run.reasoning;

    const tied =
      decision.collected_document_ids.length > 0 ||
      decision.matched_files.length > 0 ||
      [...decision.resolutions.flatMap((r) => (r.resolution === 'required' ? r.instances : [])), ...decision.addedInstances.flatMap((a) => a.instances)].some((i) => i.fileIds.length > 0);
    if (e.ties !== undefined) checks.push(eq('ties', e.ties, tied));

    if (ending === 'client_declined') {
      // The decline is the whole run (openspec `client-decline`): the judge refuses anything else, the check makes it visible.
      checks.push({ key: 'decline_alone', expected: 'client_declined is the only call', actual: calls.map((k) => k.name), pass: calls.every((k) => k.name === 'client_declined') });
    }

    if (ending === 'message' && run.message) {
      const message = run.message.message;
      const kind = message.kind;
      if (e.message_kind) checks.push(eq('message_kind', e.message_kind, kind));
      const body = message.kind === 'freeform' ? message.body : message.renderedBody;
      info.message = body;
      info.send_at = run.message.sendAt;
      if (e.mentions_valuation_date !== false) {
        const wanted = `31.12.${taxYear}`;
        checks.push({ key: 'mentions_valuation_date', expected: wanted, actual: body.includes(wanted), pass: body.includes(wanted) });
      }
      const questionMarks = (body.match(/[?؟]/g) ?? []).length;
      const maxQ = e.max_question_marks ?? 3;
      checks.push({ key: 'question_marks', expected: `<= ${maxQ}`, actual: questionMarks, pass: questionMarks <= maxQ });
      // send_at is "asap" (the code picks now + 1s) or wall-clock in the accountant's timezone, in the future.
      const sendAt = run.message.sendAt;
      const isAsap = sendAt === 'asap';
      let sendAtOk = isAsap;
      if (!isAsap) {
        try {
          sendAtOk = zonedTimeToUtc(sendAt, env.ACCOUNTANT_TIMEZONE) > now;
        } catch {
          sendAtOk = false;
        }
      }
      checks.push({ key: 'send_at_future', expected: `asap or after ${c.now}`, actual: sendAt, pass: sendAtOk });
      if (e.send_asap !== undefined) checks.push({ key: 'send_asap', expected: e.send_asap, actual: isAsap, pass: isAsap === e.send_asap });
      for (const word of e.message_includes ?? []) checks.push({ key: `message_includes.${word}`, expected: true, actual: body.includes(word), pass: body.includes(word) });
      if (e.message_includes_any) {
        const found = e.message_includes_any.filter((w) => body.includes(w));
        checks.push({ key: 'message_includes_any', expected: e.message_includes_any, actual: found, pass: found.length > 0 });
      }
      for (const word of e.message_excludes ?? []) checks.push({ key: `message_excludes.${word}`, expected: false, actual: body.includes(word), pass: !body.includes(word) });
      if (e.question_excludes) {
        // Each question = the text from the previous sentence or clause end (or the start) up to its question mark.
        const questions = body.split(/[?؟]/).slice(0, -1).map((chunk: string) => chunk.split(/[.!;\n]/).pop() ?? '');
        for (const word of e.question_excludes) {
          const asked = questions.filter((q: string) => q.includes(word));
          checks.push({ key: `question_excludes.${word}`, expected: 'not asked', actual: asked.length === 0 ? 'not asked' : asked.map((q: string) => q.trim()), pass: asked.length === 0 });
        }
      }
      for (const [rowId, words] of Object.entries(e.no_settled_rows_mentioned ?? {})) {
        const row = documents.find((d) => d.id === rowId);
        const settled = row !== undefined && SETTLED_STATUSES.has(row.status);
        const mentioned = words.filter((w) => body.includes(w));
        checks.push({ key: `no_settled_rows_mentioned.${rowId}`, expected: `settled row, none of ${JSON.stringify(words)}`, actual: settled ? mentioned : `row not settled (${row?.status ?? 'missing'})`, pass: settled && mentioned.length === 0 });
      }
      // A message in the same turn as a tie was written before the verdict (openspec `verification-reply`): visible in the report.
      const sendCall = calls.find((k) => k.name === 'send_whatsapp_text' || k.name === 'send_whatsapp_template');
      const tieTurns = calls.filter((k) => k.name === 'tie_file' || k.name === 'mark_collected').map((k) => k.turn ?? 1);
      if (sendCall && tieTurns.length > 0) {
        const after = tieTurns.every((t) => t < (sendCall.turn ?? 1));
        checks.push({ key: 'sent_after_tie_results', expected: 'the message turn comes after every tie turn', actual: after ? 'yes' : 'the message shares a turn with a tie', pass: after });
      }
    }
    const resolved = decision.resolutions.map((r) => r.documentId).sort();
    info.resolutions = decision.resolutions.map((r) => ({ id: r.documentId, resolution: r.resolution, ...(r.resolution === 'required' ? { instances: r.instances.map((i) => i.name) } : { quote: r.evidence.quote }) }));
    if (e.resolved_documents !== undefined) {
      const wantedIds = (Array.isArray(e.resolved_documents) ? e.resolved_documents : Object.keys(e.resolved_documents)).slice().sort();
      checks.push({ key: 'resolved_documents', expected: wantedIds, actual: resolved, pass: JSON.stringify(wantedIds) === JSON.stringify(resolved) });
      if (!Array.isArray(e.resolved_documents)) {
        for (const [id, resolution] of Object.entries(e.resolved_documents)) {
          checks.push(eq(`resolution.${id}`, resolution, decision.resolutions.find((r) => r.documentId === id)?.resolution ?? null));
        }
      }
    }
    for (const [id, count] of Object.entries(e.instances ?? {})) {
      const r = decision.resolutions.find((x) => x.documentId === id);
      checks.push(eq(`instances.${id}`, count, r && r.resolution === 'required' ? r.instances.length : 0));
    }
    for (const [id, source] of Object.entries(e.resolution_evidence_source ?? {})) {
      const r = decision.resolutions.find((x) => x.documentId === id);
      const actual = !r ? null : 'quote' in r.evidence ? 'quote' : r.evidence.source;
      checks.push(eq(`resolution_evidence_source.${id}`, source, actual));
    }
    if (e.added_instances !== undefined) {
      const addedByType: Record<string, number> = {};
      for (const addition of decision.addedInstances) {
        const typeKey = documents.find((d) => d.id === addition.anchorDocumentId)?.type_key ?? `unknown:${addition.anchorDocumentId}`;
        addedByType[typeKey] = (addedByType[typeKey] ?? 0) + addition.instances.length;
      }
      info.added_instance_names = decision.addedInstances.flatMap((a) => a.instances.map((i) => i.name));
      const sortKeys = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
      checks.push({ key: 'added_instances', expected: sortKeys(e.added_instances), actual: sortKeys(addedByType), pass: JSON.stringify(sortKeys(e.added_instances)) === JSON.stringify(sortKeys(addedByType)) });
    }
    if (e.retired_documents !== undefined) {
      const retiredIds = decision.retired.map((r) => r.documentId).sort();
      const wanted = e.retired_documents.slice().sort();
      checks.push({ key: 'retired_documents', expected: wanted, actual: retiredIds, pass: JSON.stringify(wanted) === JSON.stringify(retiredIds) });
    }
    if (e.set_companies !== undefined) {
      const sortKeys = (o: Record<string, string | null>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
      const actual = sortKeys(Object.fromEntries(decision.setCompanies.map((s) => [s.documentId, s.companyKey])));
      const wanted = sortKeys(e.set_companies);
      checks.push({ key: 'set_companies', expected: wanted, actual, pass: JSON.stringify(wanted) === JSON.stringify(actual) });
    }
    if (e.no_list_change !== undefined) {
      const changes = decision.resolutions.length + decision.addedInstances.length + decision.retired.length + decision.setCompanies.length;
      checks.push({ key: 'no_list_change', expected: e.no_list_change ? 0 : '>0', actual: changes, pass: e.no_list_change ? changes === 0 : changes > 0 });
    }
    if (e.new_instance_file_ids !== undefined) {
      const named = [
        ...decision.resolutions.flatMap((r) => (r.resolution === 'required' ? r.instances.flatMap((i) => i.fileIds) : [])),
        ...decision.addedInstances.flatMap((a) => a.instances.flatMap((i) => i.fileIds)),
      ].sort();
      const wanted = e.new_instance_file_ids.slice().sort();
      checks.push({ key: 'new_instance_file_ids', expected: wanted, actual: named, pass: JSON.stringify(wanted) === JSON.stringify(named) });
    }
    if (e.matched_file_ids !== undefined) {
      const paired = decision.matched_files.map((m) => m.file_id).sort();
      const wanted = e.matched_file_ids.slice().sort();
      checks.push({ key: 'matched_file_ids', expected: wanted, actual: paired, pass: JSON.stringify(wanted) === JSON.stringify(paired) });
    }
    if (e.stated_costs !== undefined) {
      const sortKeys = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
      const actual = sortKeys(Object.fromEntries(decision.statedCosts.map((c) => [c.documentId, c.amount])));
      const wanted = sortKeys(e.stated_costs);
      checks.push({ key: 'stated_costs', expected: wanted, actual, pass: JSON.stringify(wanted) === JSON.stringify(actual) });
    }
    if (e.new_instance_stated_amounts !== undefined) {
      const amounts = [
        ...decision.resolutions.flatMap((r) => (r.resolution === 'required' ? r.instances : [])),
        ...decision.addedInstances.flatMap((a) => a.instances),
      ]
        .flatMap((i) => (i.statedCost ? [i.statedCost.amount] : []))
        .sort((a, b) => a - b);
      const wanted = e.new_instance_stated_amounts.slice().sort((a, b) => a - b);
      checks.push({ key: 'new_instance_stated_amounts', expected: wanted, actual: amounts, pass: JSON.stringify(wanted) === JSON.stringify(amounts) });
    }
    // openspec vehicle-declaration: the facts stated on existing / new vehicle declarations (listed facts must match; extra facts allowed).
    const factsMatch = (wanted: Record<string, string | number>, actual: Record<string, unknown>) =>
      Object.entries(wanted).every(([k, v]) => String(actual[k]) === String(v));
    if (e.stated_vehicles !== undefined) {
      const actual = Object.fromEntries(decision.statedVehicles.map((v) => [v.documentId, v.facts as Record<string, unknown>]));
      const wantedIds = Object.keys(e.stated_vehicles).sort();
      const pass = JSON.stringify(Object.keys(actual).sort()) === JSON.stringify(wantedIds) && wantedIds.every((id) => factsMatch(e.stated_vehicles![id]!, actual[id]!));
      checks.push({ key: 'stated_vehicles', expected: e.stated_vehicles, actual, pass });
    }
    if (e.new_instance_stated_vehicles !== undefined) {
      const stated = [
        ...decision.resolutions.flatMap((r) => (r.resolution === 'required' ? r.instances : [])),
        ...decision.addedInstances.flatMap((a) => a.instances),
      ].flatMap((i) => (i.statedVehicle ? [i.statedVehicle.facts as Record<string, unknown>] : []));
      const unmatched = [...stated];
      const allFound = e.new_instance_stated_vehicles.every((w) => {
        const at = unmatched.findIndex((a) => factsMatch(w, a));
        if (at < 0) return false;
        unmatched.splice(at, 1);
        return true;
      });
      checks.push({ key: 'new_instance_stated_vehicles', expected: e.new_instance_stated_vehicles, actual: stated, pass: allFound && unmatched.length === 0 });
    }
    info.evidence_quotes = [
      ...decision.resolutions.map((r) => ('quote' in r.evidence ? r.evidence.quote : `self-evident file ${r.evidence.file_id}`)),
      ...decision.addedInstances.map((a) =>
        'quote' in a.evidence ? a.evidence.quote : a.evidence.source === 'self_evident_file' ? `self-evident file ${a.evidence.file_id}` : `approved file ${a.evidence.file_id}`,
      ),
    ];
    if (e.attestation !== undefined) checks.push(eq('attestation', e.attestation, decision.attestation?.action ?? null));
    if (e.document_fetch_action !== undefined) checks.push(eq('document_fetch_action', e.document_fetch_action, decision.document_fetch?.action ?? null));
    // openspec `team-questions`: did the answer ask the team, and what.
    const asked = run.teamQuestion;
    if (e.team_question !== undefined) checks.push(eq('team_question', e.team_question, asked !== null));
    for (const word of e.team_question_includes ?? []) {
      const has = asked?.question.includes(word) === true;
      checks.push({ key: `team_question_includes.${word}`, expected: true, actual: has, pass: has });
    }
    info.team_question = asked;
    info.document_fetch = decision.document_fetch ?? null;
    info.attestation = decision.attestation;
    info.collected_document_ids = decision.collected_document_ids;
    info.addedInstances = decision.addedInstances.length;
    info.retired = decision.retired.length;
    return { checks, info };
  },
};

// ---------------------------------------------------------------------------

export const STAGES: Record<string, StageAdapter<never, never>> = {
  injection_detection_llm: injectionScreen as StageAdapter<never, never>,
  questionnaire_schema_mapping: formIntake as StageAdapter<never, never>,
  file_splitting: splitFileStage as StageAdapter<never, never>,
  file_classification: analyzeFile as StageAdapter<never, never>,
  extract_document: verifyDocument as StageAdapter<never, never>,
  planner: conversationDecide as StageAdapter<never, never>,
};

export const STAGE_NAMES = Object.keys(STAGES);

export interface LoadedStage {
  stage: StageAdapter<unknown, unknown>;
  ctx: Record<string, unknown>;
  cases: Array<{ id: string; notes?: string }>;
}

/** The case file with its shared context (everything but `cases`). */
export function loadStage(name: string): LoadedStage {
  const stage = STAGES[name] as StageAdapter<unknown, unknown> | undefined;
  if (!stage) throw new Error(`unknown stage "${name}" (known: ${STAGE_NAMES.join(', ')})`);
  const { cases, ...ctx } = stage.load() as { cases: Array<{ id: string; notes?: string }> } & Record<string, unknown>;
  return { stage, ctx, cases };
}
