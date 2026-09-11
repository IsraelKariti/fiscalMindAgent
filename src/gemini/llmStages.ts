import { zodToJsonSchema } from 'zod-to-json-schema';
import { LLM_CALL_PURPOSES, providerForModel, type LlmCallPurpose } from './modelCatalog.js';
import { getGeminiModel } from './modelSettings.js';
import { FORM_INTAKE_PROMPT } from '../agents/declarationOfCapital/formIntakeCall.js';
import { buildFormIntakeSchema } from '../agents/declarationOfCapital/formIntakeRules.js';
import { CAPITAL_DOCUMENT_CATALOG } from '../agents/declarationOfCapital/catalog.js';
import { EXTRACTION_PROMPT, extractionJsonSchema } from '../agents/declarationOfCapital/verifyChecks.js';
import { PROMPT_TEMPLATE } from '../agents/declarationOfCapital/prompt.js';
import { FILE_SCREEN_PROMPT, InjectionScreenSchema, SCREEN_PROMPT } from '../agents/shared/injectionScreen.js';
import { ANALYSIS_PROMPT, YEAR_CONTEXT } from '../agents/declarationOfCapital/analyzeFile.js';
import { CapitalFileAnalysisSchema } from '../agents/declarationOfCapital/analyzeFileRules.js';
import { decisionSchemaForContext, type DecisionContext } from '../agents/declarationOfCapital/decisionSchema.js';
import { buildUntrustedDataDoctrine } from '../agents/shared/promptSafety.js';

/**
 * The pipeline's LLM stages, described from the SAME constants the call sites
 * use (prompt templates, schemas, temperatures) so the admin's stage page can
 * never drift from the code. Served by GET /api/admin/llm-stages; the
 * llmStages unit test fails when a purpose in LLM_CALL_PURPOSES is missing
 * here. Placeholders stay as `{{name}}` — they are filled per call.
 */

export interface LlmStagePrompt {
  variant: string;
  systemPrompt: string;
}

export interface LlmStageQueryPart {
  kind: 'text' | 'binary';
  body: string;
}

export interface LlmStageDescription {
  purpose: LlmCallPurpose;
  title: string;
  /** Where the call site lives. */
  file: string;
  /** The code gate that checks this stage's answer before anything uses it. */
  gate: string;
  /** The model the admin setting currently resolves to, and its provider. */
  model: string;
  provider: string;
  temperature: number;
  placeholders: string[];
  prompts: LlmStagePrompt[];
  /** The layout of the user turn(s). */
  query: { variant: string; parts: LlmStageQueryPart[] }[];
  /** Response JSON schema (the first/most complete variant). */
  schema: Record<string, unknown>;
}

const TEMPERATURES: Record<LlmCallPurpose, number> = {
  conversation_decide: 0.3,
  form_intake: 0,
  injection_screen: 0,
  analyze_file: 0.1,
  verify_document: 0,
};

const CAPITAL_DECISION_CONTEXT: DecisionContext = {
  emailAllowed: false,
  whatsappAllowed: true,
  windowOpen: true,
  templates: [],
  intake: {
    resolvable: [],
    typedRows: [],
    inboundTexts: new Map(),
    allSettled: false,
    attestationRequested: false,
    confirmableMessageIds: new Set(),
    attestationConfirmed: false,
  },
};

function jsonSchema(zod: unknown): Record<string, unknown> {
  const json = zodToJsonSchema(zod as never, { $refStrategy: 'none' }) as Record<string, unknown>;
  delete json.$schema;
  return json;
}

function placeholdersOf(texts: string[]): string[] {
  const found = new Set<string>();
  for (const text of texts) for (const m of text.matchAll(/\{\{([a-z_]+)\}\}/g)) found.add(m[1] ?? '');
  return [...found].filter(Boolean).sort();
}

type StageStatic = Omit<LlmStageDescription, 'model' | 'provider' | 'temperature' | 'placeholders'>;

const STAGES: StageStatic[] = [
  {
    purpose: 'injection_screen',
    title: 'Injection screen',
    file: 'src/agents/shared/injectionScreen.ts · screenForInjection / screenFileForInjection',
    gate: 'validate_injection_scan',
    prompts: [
      { variant: 'text — form answers, inbound message', systemPrompt: SCREEN_PROMPT },
      { variant: 'file — PDF or image bytes', systemPrompt: FILE_SCREEN_PROMPT },
    ],
    query: [
      { variant: 'text', parts: [{ kind: 'text', body: '--- TEXT UNDER REVIEW [{{token}}] ---\n<the sanitized text>\n--- END TEXT UNDER REVIEW [{{token}}] ---' }] },
      { variant: 'file', parts: [{ kind: 'binary', body: 'the file bytes (PDF / image)' }, { kind: 'text', body: 'שם הקובץ כפי שנשלח: <filename>' }] },
    ],
    schema: jsonSchema(InjectionScreenSchema),
  },
  {
    purpose: 'form_intake',
    title: 'Questionnaire → checklist mapping',
    file: 'src/agents/declarationOfCapital/formIntake.ts · applyFormIntake',
    gate: 'validate_form_resolutions',
    prompts: [{ variant: 'default', systemPrompt: FORM_INTAKE_PROMPT }],
    query: [
      {
        variant: 'default',
        parts: [
          {
            kind: 'text',
            body: '--- SUBMITTED ANSWERS [{{token}}] ---\nשאלה: …\nתשובה: …\n--- END SUBMITTED ANSWERS [{{token}}] ---\n\n--- EMPTY QUESTIONS [{{token}}] ---\n- …\n--- END EMPTY QUESTIONS [{{token}}] ---',
          },
        ],
      },
    ],
    // Documented with the whole catalog; per call the schema carries only the client's open rows.
    schema: jsonSchema(buildFormIntakeSchema(CAPITAL_DOCUMENT_CATALOG.map((t) => t.key) as [string, ...string[]])),
  },
  {
    purpose: 'conversation_decide',
    title: 'Conversation planner',
    file: 'src/agents/declarationOfCapital/decide.ts · decide (prompt: prompt.ts + prompt.md)',
    gate: 'validate_message',
    prompts: [
      {
        variant: 'template + untrusted-data doctrine',
        systemPrompt: `${PROMPT_TEMPLATE}\n\n${buildUntrustedDataDoctrine('{{token}}', true)}`,
      },
    ],
    query: [
      {
        variant: 'default',
        parts: [
          {
            kind: 'text',
            body: '--- REQUIRED DOCUMENTS [{{token}}] --- … --- SUBMITTED QUESTIONNAIRE [{{token}}] --- … --- INTAKE STATUS [{{token}}] --- … --- MESSAGE THREAD [{{token}}] --- …\n\nDecide the next action now.',
          },
        ],
      },
    ],
    schema: jsonSchema(decisionSchemaForContext(CAPITAL_DECISION_CONTEXT)),
  },
  {
    purpose: 'analyze_file',
    title: 'File classification',
    file: 'src/agents/declarationOfCapital/analyzeFile.ts · analyzeFile',
    gate: 'validate_classification',
    prompts: [{ variant: 'default', systemPrompt: ANALYSIS_PROMPT.replace('{{year_context}}', YEAR_CONTEXT) }],
    query: [{ variant: 'default', parts: [{ kind: 'binary', body: 'the file bytes (PDF / image)' }, { kind: 'text', body: 'שם הקובץ כפי שנשלח: <filename>' }] }],
    schema: jsonSchema(CapitalFileAnalysisSchema),
  },
  {
    purpose: 'verify_document',
    title: 'Extraction for verification',
    file: 'src/agents/declarationOfCapital/verifyDocument.ts · verifyCollectedDocument (prompt: extractionCall.ts / verifyChecks.ts)',
    gate: 'verify_extraction',
    prompts: [{ variant: 'default', systemPrompt: EXTRACTION_PROMPT.replace('{{filename}}', '') }],
    query: [{ variant: 'default', parts: [{ kind: 'binary', body: 'the file bytes (PDF / image)' }, { kind: 'text', body: 'שם הקובץ כפי שנשלח: <filename>' }] }],
    schema: extractionJsonSchema,
  },
];

/** Purposes in LLM_CALL_PURPOSES with no entry above — must be empty (unit-tested). */
export function undocumentedPurposes(): string[] {
  const documented = new Set(STAGES.map((s) => s.purpose));
  return LLM_CALL_PURPOSES.filter((p) => !documented.has(p));
}

/** Static description (no DB): everything but the currently resolved model. */
export function describeLlmStagesStatic(): Omit<LlmStageDescription, 'model' | 'provider'>[] {
  return STAGES.map((s) => ({
    ...s,
    temperature: TEMPERATURES[s.purpose],
    placeholders: placeholdersOf(s.prompts.map((p) => p.systemPrompt)),
  }));
}

/** The full description including the model each purpose currently resolves to (admin setting). */
export async function describeLlmStages(): Promise<LlmStageDescription[]> {
  return Promise.all(
    describeLlmStagesStatic().map(async (s) => {
      const model = await getGeminiModel(s.purpose);
      return { ...s, model, provider: providerForModel(model) };
    }),
  );
}
