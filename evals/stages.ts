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
import { extractFileText } from '../src/agents/shared/fileText.js';
import { sanitizeInline, sanitizeUntrusted } from '../src/agents/shared/promptSafety.js';
import { buildFormIntakeCall } from '../src/agents/declarationOfCapital/formIntakeCall.js';
import {
  validateFormResolutions,
  type FormAnswer,
  type FormIntakeResponse,
  type FormResolvableRow,
} from '../src/agents/declarationOfCapital/formIntakeRules.js';
import { CAPITAL_DOCUMENT_CATALOG, getCatalogType } from '../src/agents/declarationOfCapital/catalog.js';
import { buildAnalysisCall } from '../src/agents/declarationOfCapital/analyzeFile.js';
import { CapitalFileAnalysisSchema, validateClassification, type FileAnalysis } from '../src/agents/declarationOfCapital/analyzeFileRules.js';
import { buildExtractionCall, checksFor } from '../src/agents/declarationOfCapital/extractionCall.js';
import {
  ExtractionSchema,
  namesLooselyMatch,
  runChecks,
  type ExtractedFields,
} from '../src/agents/declarationOfCapital/verifyChecks.js';
import { buildDecisionCall } from '../src/agents/declarationOfCapital/decide.js';
import {
  normalizeDecision,
  restorePrunedNulls,
  type DecisionContext,
  type DecisionResponse,
  type IntakeDecisionState,
} from '../src/agents/declarationOfCapital/decisionSchema.js';
import { buildPrompt, type IntakePromptInput, type WaChannelState } from '../src/agents/declarationOfCapital/prompt.js';
import { env } from '../src/config/env.js';
import { zonedTimeToUtc } from '../src/util/time.js';
import type { LlmCallPurpose } from '../src/gemini/modelCatalog.js';
import type { LlmCallSpec } from '../src/gemini/llmCall.js';
import type {
  ClientDocumentRow,
  ClientRow,
  DocumentFileRow,
  DocumentStatus,
  EmailRow,
  UserRow,
  WaTemplateRow,
} from '../src/db/types.js';

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
  /** The stage's own schema parse of the answer text — what gets stored as `output`. */
  parse: (text: string) => unknown;
}

export interface StageAdapter<C = unknown, Ctx = unknown> {
  purpose: LlmCallPurpose;
  /** The raw case file: `cases` plus the shared context (everything else). */
  load(): { cases: C[] } & Ctx;
  build(c: C, ctx: Ctx): BuiltCall;
  judge(c: C, output: unknown, ctx: Ctx): Judgement;
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CASES_DIR = path.join(HERE, 'cases');
const FILES_DIR = path.join(HERE, 'files');

const readCases = <T>(stage: string): T => JSON.parse(fs.readFileSync(path.join(CASES_DIR, `${stage}.json`), 'utf8')) as T;
const readFile = (name: string): Buffer => fs.readFileSync(path.join(FILES_DIR, name));

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
  build(c) {
    const spec =
      c.kind === 'file'
        ? buildFileScreenCall({ bytes: readFile(c.file), contentType: c.contentType, filename: c.filename })
        : buildInjectionScreenCall(joinSnippets(textSnippets(c)));
    return { spec, parse: (text) => InjectionScreenSchema.parse(JSON.parse(text)) };
  },
  judge(c, output) {
    const raw = output as { suspected_injection: boolean; evidence: string | null };
    let text: string | null;
    let regexInput: string;
    if (c.kind === 'file') {
      const layer = extractFileText(readFile(c.file), c.contentType);
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
    return { spec, parse: (text) => schema.parse(JSON.parse(text)) };
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
// file_classification

interface AnalyzeFileCase {
  id: string;
  file: string;
  contentType: string;
  filename: string;
  expected: {
    document_type?: string | (string | null)[];
    matched_document_id?: string | null | (string | null)[];
    legible?: boolean;
    injection_suspected?: boolean;
    /** document_kind must contain one of these (case-insensitive). */
    document_kind_any?: string[];
  };
  notes?: string;
}
interface ChecklistRow {
  id: string;
  name: string;
  description: string | null;
  type_key: string | null;
}
interface AnalyzeFileCtx {
  taxYear: number;
  checklist: ChecklistRow[];
}

const analyzeFile: StageAdapter<AnalyzeFileCase, AnalyzeFileCtx> = {
  purpose: 'file_classification',
  load: () => readCases('file_classification'),
  build(c, ctx) {
    const spec = buildAnalysisCall({
      bytes: readFile(c.file),
      contentType: c.contentType,
      filename: c.filename,
      requiredDocuments: ctx.checklist,
      taxYear: ctx.taxYear,
    });
    return { spec, parse: (text) => CapitalFileAnalysisSchema.parse(JSON.parse(text)) };
  },
  judge(c, output, ctx) {
    const raw = output as FileAnalysis;
    const gate = validateClassification(raw, ctx.checklist);
    const a = gate.analysis;
    const checks: Check[] = [];
    const e = c.expected;
    if (e.document_type !== undefined) checks.push(eq('document_type', e.document_type, a.document_type ?? null));
    if (e.matched_document_id !== undefined) checks.push(eq('matched_document_id', e.matched_document_id, a.matched_document_id));
    if (e.legible !== undefined) checks.push(eq('legible', e.legible, a.legible));
    if (e.injection_suspected !== undefined) checks.push(eq('injection_suspected', e.injection_suspected, a.injection_suspected));
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
  client: { name: string; idNumber: string | null };
  expected: {
    is_expected_type?: boolean;
    legible?: boolean;
    injection_suspected?: boolean;
    as_of_date?: string | null | (string | null)[];
    valid_until?: string | null | (string | null)[];
    subject_id_number?: string;
    subject_name_matches?: boolean;
    amount?: { value: number; currency: string };
    /** What runChecks() must decide; every key in failed_keys must be among the failures. */
    verdict?: { passed: boolean; failed_keys?: string[] };
  };
  notes?: string;
}
interface VerifyDocumentCtx {
  taxYear: number;
  /** Verification time (ISO) — the not_expired check is judged against it. */
  now: string;
}

const verifyDocument: StageAdapter<VerifyDocumentCase, VerifyDocumentCtx> = {
  purpose: 'extract_document',
  load: () => readCases('extract_document'),
  build(c, ctx) {
    const spec = buildExtractionCall({ doc: c.doc, bytes: readFile(c.file), contentType: c.contentType, filename: c.filename, taxYear: ctx.taxYear });
    return { spec, parse: (text) => ExtractionSchema.parse(JSON.parse(text)) };
  },
  judge(c, output, ctx) {
    const data = output as ExtractedFields;
    const e = c.expected;
    const checks: Check[] = [];
    if (e.is_expected_type !== undefined) checks.push(eq('is_expected_type', e.is_expected_type, data.is_expected_type));
    if (e.legible !== undefined) checks.push(eq('legible', e.legible, data.legible));
    if (e.injection_suspected !== undefined) checks.push(eq('injection_suspected', e.injection_suspected, data.injection_suspected));
    // Models put "" or "/" where the schema says null; runChecks reads only well-formed dates, so judge the same way.
    if (e.as_of_date !== undefined) checks.push({ ...eq('as_of_date', e.as_of_date, dateOrNull(data.as_of_date)), actual: data.as_of_date });
    if (e.valid_until !== undefined) checks.push({ ...eq('valid_until', e.valid_until, dateOrNull(data.valid_until)), actual: data.valid_until });
    if (e.subject_id_number !== undefined) checks.push(eq('subject_id_number', digits(e.subject_id_number), digits(data.subject_id_number)));
    if (e.subject_name_matches !== undefined) {
      checks.push({
        key: 'subject_name_matches',
        expected: e.subject_name_matches,
        actual: data.subject_name,
        // The app's subject rule (runChecks): a printed ID that matches the client vouches for the subject;
        // only otherwise does the (loosely matched) name decide. A Latin-script name on a Hebrew client is fine when the ID matches.
        pass:
          ((digits(data.subject_id_number) !== '' && digits(data.subject_id_number) === digits(c.client.idNumber)) ||
            namesLooselyMatch(data.subject_name ?? '', c.client.name)) === e.subject_name_matches,
      });
    }
    if (e.amount) {
      const want = e.amount;
      const hit = data.amounts.find((x) => Math.abs(x.value - want.value) <= 0.005 && x.currency.toUpperCase() === want.currency.toUpperCase());
      checks.push({ key: 'amount', expected: e.amount, actual: data.amounts, pass: hit !== undefined });
    }
    // The deterministic verdict the app would reach with these fields (extract_document's code half).
    const verdict = runChecks(data, {
      clientName: c.client.name,
      credentialIdNumber: c.client.idNumber ?? null,
      taxYear: ctx.taxYear,
      now: new Date(ctx.now),
      checks: checksFor(c.doc),
    });
    const failedKeys = verdict.checks.filter((x) => !x.passed).map((x) => x.key);
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
    }
    return {
      checks,
      info: { verdict: { passed: verdict.passed, failedKeys, reasons: verdict.reasons }, actual_kind: data.actual_kind, issuer: data.issuer },
    };
  },
};

// ---------------------------------------------------------------------------
// generate_message (declaration of capital, WhatsApp-only)

interface DecideDocumentInput {
  id?: string;
  type_key: string | null;
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
  attestation?: {
    /** ISO instant the attestation summary was SENT; null = not requested. */
    requestedAt: string | null;
    confirmed?: boolean;
  };
  expects: {
    decision: 'goal_complete' | 'follow_up';
    message_kind?: 'freeform' | 'template';
    /** Ids the decision must resolve (exactly this set); an object also pins the resolution per id. */
    resolved_documents?: string[] | Record<string, 'required' | 'not_required'>;
    /** Per resolved id: the exact number of instances. */
    instances?: Record<string, number>;
    attestation?: 'request' | 'confirmed' | null;
    suspected_injection?: boolean;
    /** Row id -> substrings that must NOT appear in the message (the row is settled and must not be brought up). */
    no_settled_rows_mentioned?: Record<string, string[]>;
    /** Default true for follow_up: the message names 31.12.<taxYear>. */
    mentions_valuation_date?: boolean;
    /** Default 3. */
    max_question_marks?: number;
  };
  notes?: string;
}
interface DecideCtx {
  taxYear: number;
  accountant: { name: string; hebrew_name: string | null; email: string };
  templates: Array<{ content_sid: string; name: string; body: string; variable_count: number }>;
}

const SETTLED_STATUSES = new Set<DocumentStatus>(['not_required', 'approved', 'retired', 'claimed', 'collected']);

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
    draft_failed_at: null,
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
    if (seenIds.has(id)) throw new Error(`generate_message case ${c.id}: duplicate document id ${id} — give explicit ids to sibling rows`);
    seenIds.add(id);
    return {
      id,
      client_id: 'client-eval',
      name: d.name ?? t?.nameHe.replaceAll('{{tax_year}}', year) ?? id,
      description: d.description === undefined ? (t?.descriptionHe.replaceAll('{{tax_year}}', year) ?? null) : d.description,
      status: d.status,
      type_key: d.type_key,
      verification: d.verification ?? null,
      resolution_evidence: null,
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
      sent_at: at,
      created_at: at,
    };
  });
}

function templateRows(c: DecideCase, ctx: DecideCtx): WaTemplateRow[] {
  return c.wa.templates.map((name) => {
    const t = ctx.templates.find((x) => x.name === name);
    if (!t) throw new Error(`generate_message case ${c.id}: unknown template "${name}"`);
    return { id: `tpl-${t.name}`, content_sid: t.content_sid, name: t.name, body: t.body, variable_count: t.variable_count, agent_type: 'declaration_of_capital', created_at: new Date('2025-01-01T00:00:00Z') };
  });
}

/** The whole planning input for one snapshot — the same shapes plan.ts assembles from the DB. */
function decideInputs(c: DecideCase, ctx: DecideCtx) {
  const taxYear = c.taxYear ?? ctx.taxYear;
  const now = new Date(c.now);
  const client = clientRow(c);
  const history = threadRows(c);
  const documents = documentRows(c, taxYear);
  const files: DocumentFileRow[] = [];
  const templates = templateRows(c, ctx);
  const waState: WaChannelState = {
    allowed: true,
    unavailableReason: null,
    windowOpen: c.wa.windowOpen,
    windowClosesAt: c.wa.windowClosesAt ? new Date(c.wa.windowClosesAt) : null,
    templates,
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
        multiInstance: (d.type_key ? getCatalogType(d.type_key)?.multiInstance : undefined) ?? false,
      })),
    typedRows: documents
      .filter((d) => d.type_key !== null && d.status !== 'unresolved' && d.status !== 'not_required')
      .map((d) => ({ id: d.id, status: d.status, multiInstance: getCatalogType(d.type_key as string)?.multiInstance ?? false })),
    inboundTexts,
    allSettled: documents.length > 0 && documents.every((d) => d.status === 'approved' || d.status === 'not_required' || d.status === 'retired'),
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
  const decisionCtx: DecisionContext = {
    emailAllowed: false,
    whatsappAllowed: true,
    windowOpen: waState.windowOpen,
    templates,
    intake,
  };
  return { taxYear, now, client, history, documents, files, waState, intakePrompt, decisionCtx };
}

const conversationDecide: StageAdapter<DecideCase, DecideCtx> = {
  purpose: 'generate_message',
  load: () => readCases('generate_message'),
  build(c, ctx) {
    const { taxYear, now, client, history, documents, files, waState, intakePrompt, decisionCtx } = decideInputs(c, ctx);
    const accountant = accountantRow(ctx);
    const prompt = buildPrompt(client, accountant, history, documents, files, now, waState, [], taxYear, intakePrompt);
    const { spec, schema } = buildDecisionCall({ systemInstruction: prompt.systemInstruction, contents: prompt.contents, ctx: decisionCtx });
    return { spec, parse: (text) => restorePrunedNulls(schema.parse(JSON.parse(text))) };
  },
  judge(c, output, ctx) {
    const raw = output as DecisionResponse;
    const { taxYear, now, documents, decisionCtx } = decideInputs(c, ctx);
    const e = c.expects;
    const checks: Check[] = [];
    const info: Record<string, unknown> = { reasoning: raw.reasoning, send_at: raw.send_at };
    let decision: ReturnType<typeof normalizeDecision>;
    try {
      decision = normalizeDecision(raw, decisionCtx);
    } catch (err) {
      // The gate rejected the answer (missing/fabricated evidence, wrong channel, bad send_at, …): the app would retry once, then fail the cycle.
      checks.push({ key: 'gate', expected: 'accepted', actual: errorMessage(err).slice(0, 500), pass: false });
      checks.push(eq('decision', e.decision, raw.decision));
      return { checks, info };
    }
    checks.push({ key: 'gate', expected: 'accepted', actual: 'accepted', pass: true });
    checks.push(eq('decision', e.decision, decision.decision));
    if (e.suspected_injection !== undefined) checks.push(eq('suspected_injection', e.suspected_injection, decision.suspected_injection));

    if (decision.decision === 'follow_up') {
      const message = decision.message;
      checks.push(eq('channel', 'whatsapp', message.channel));
      const kind = message.channel === 'whatsapp' ? message.kind : 'email';
      if (e.message_kind) checks.push(eq('message_kind', e.message_kind, kind));
      const body = message.channel === 'whatsapp' ? (message.kind === 'freeform' ? message.body : message.renderedBody) : message.body;
      info.message = body;
      if (e.mentions_valuation_date !== false) {
        const wanted = `31.12.${taxYear}`;
        checks.push({ key: 'mentions_valuation_date', expected: wanted, actual: body.includes(wanted), pass: body.includes(wanted) });
      }
      const questionMarks = (body.match(/[?؟]/g) ?? []).length;
      const maxQ = e.max_question_marks ?? 3;
      checks.push({ key: 'question_marks', expected: `<= ${maxQ}`, actual: questionMarks, pass: questionMarks <= maxQ });
      // send_at is wall-clock in the accountant's timezone and must be in the future.
      let sendAtOk = false;
      try {
        sendAtOk = zonedTimeToUtc(decision.send_at, env.ACCOUNTANT_TIMEZONE) > now;
      } catch {
        sendAtOk = false;
      }
      checks.push({ key: 'send_at_future', expected: `after ${c.now}`, actual: decision.send_at, pass: sendAtOk });
      for (const [rowId, words] of Object.entries(e.no_settled_rows_mentioned ?? {})) {
        const row = documents.find((d) => d.id === rowId);
        const settled = row !== undefined && SETTLED_STATUSES.has(row.status);
        const mentioned = words.filter((w) => body.includes(w));
        checks.push({ key: `no_settled_rows_mentioned.${rowId}`, expected: `settled row, none of ${JSON.stringify(words)}`, actual: settled ? mentioned : `row not settled (${row?.status ?? 'missing'})`, pass: settled && mentioned.length === 0 });
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
    if (e.attestation !== undefined) checks.push(eq('attestation', e.attestation, decision.attestation?.action ?? null));
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
  file_classification: analyzeFile as StageAdapter<never, never>,
  extract_document: verifyDocument as StageAdapter<never, never>,
  generate_message: conversationDecide as StageAdapter<never, never>,
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
