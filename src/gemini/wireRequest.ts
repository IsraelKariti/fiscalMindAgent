/**
 * What a provider adapter actually sends, computed from the same pure
 * translators the adapters use (openspec `conversation-trace`, "the call
 * record keeps the request as the provider received it"). Pure: no env, DB
 * or network imports, so the tests can pin the sent shapes.
 *
 * The Gemini SDK sends the request exactly as declared, so Gemini has no
 * sent copy (null). Anthropic and OpenAI get their schema / tools from here
 * (one source), and the retry loop stores the result as `request.sent` of the
 * llm_calls row and records the changes as the `translate_request` trace step.
 */

import { emptySchemaChanges, schemaChanged, toAnthropicSchema, type SchemaChanges } from './anthropicSchema.js';
import { declaredToolsOf } from './requestLog.js';
import { toAnthropicTools, toOpenAiTools } from './toolTransport.js';

/** One tool as the provider received it, in one shape for every provider (the modal reads this). */
export interface SentTool {
  name: string;
  description: string;
  parameters: unknown;
  strict: boolean;
}

/** The parts of the request the adapter changed before sending, as stored in `llm_calls.request.sent`. */
export interface SentRequest {
  provider: 'anthropic' | 'openai';
  /** The answer schema as sent (a stage that answers with one JSON object). */
  responseJsonSchema?: unknown;
  /** The tool set as sent (a tool-call stage). */
  tools?: SentTool[];
  /** Whether the provider enforces the schema / tools word for word. */
  strict: boolean;
  /** Declared request fields the adapter left out. */
  omitted: string[];
}

/** The sent copy plus what changed, for the `translate_request` trace step. */
export interface Translation {
  sent: SentRequest;
  changes: SchemaChanges;
  /** The schema or tool parameter schemas differ from the declared ones. */
  schemaChanged: boolean;
  /** The tools were marked strict (tool-call stages only). */
  toolsStrict: boolean;
}

/** Structural view of a Gemini-shaped request — what the translators need. */
export interface TranslatableRequest {
  model: string;
  config?: {
    temperature?: unknown;
    responseJsonSchema?: unknown;
    tools?: unknown;
  };
}

/**
 * The translation a provider adapter applies to this request, or null when
 * the provider sends it as declared (Gemini).
 */
export function translationOf(provider: string, request: TranslatableRequest): Translation | null {
  if (provider !== 'anthropic' && provider !== 'openai') return null;
  const cfg = request.config ?? {};
  const changes = emptySchemaChanges();
  const omitted = cfg.temperature !== undefined ? ['temperature'] : [];
  const tools = declaredToolsOf(cfg);
  const sent: SentRequest = { provider, strict: true, omitted };
  let toolsStrict = false;

  if (provider === 'anthropic') {
    if (cfg.responseJsonSchema !== undefined) sent.responseJsonSchema = toAnthropicSchema(cfg.responseJsonSchema, changes);
    if (tools.length > 0) {
      sent.tools = toAnthropicTools(tools, changes).map((t) => ({
        name: t.name,
        description: t.description ?? '',
        parameters: t.input_schema,
        strict: t.strict === true,
      }));
      toolsStrict = true;
    }
  } else {
    // OpenAI: the answer schema goes out unchanged (strict mode accepts it);
    // tools gain additionalProperties:false and the strict flag.
    if (cfg.responseJsonSchema !== undefined) sent.responseJsonSchema = cfg.responseJsonSchema;
    if (tools.length > 0) {
      sent.tools = toOpenAiTools(tools, changes).map((t) => ({
        name: String(t.name),
        description: String(t.description ?? ''),
        parameters: t.parameters,
        strict: t.strict === true,
      }));
      toolsStrict = true;
    }
  }
  return { sent, changes, schemaChanged: schemaChanged(changes), toolsStrict };
}

/** The sent copy alone, for the call log; null when the provider sends the request as declared. */
export function sentRequestOf(provider: string, request: TranslatableRequest): SentRequest | null {
  return translationOf(provider, request)?.sent ?? null;
}

/**
 * The nullable fields an adapter filled with null on the way back, attached
 * by the Anthropic adapter to its Gemini-shaped response as `restoredFields`;
 * null when the adapter changed nothing in the answer (Gemini, OpenAI, and
 * tool-call answers).
 */
export function restoredFieldsOf(response: unknown): string[] | null {
  const fields = (response as { restoredFields?: unknown } | null)?.restoredFields;
  return Array.isArray(fields) ? fields.map(String) : null;
}

/** The `translate_request` step's detail: plain lists the step modal renders as labelled rows. */
export function translationStepDetail(translation: Translation, purpose: string, model: string): Record<string, unknown> {
  const { sent, changes } = translation;
  return {
    provider: sent.provider,
    purpose,
    model,
    schema_changed: translation.schemaChanged,
    null_removed: changes.nullRemoved,
    required_dropped: changes.requiredDropped,
    keywords_stripped: changes.keywordsStripped.map((k) => `${k.path}: ${k.keyword}`),
    additional_properties_forced: changes.additionalPropertiesForced,
    omitted: sent.omitted,
    tools_strict: translation.toolsStrict,
  };
}

/** One of the two translation code steps, as the retry loop records it (actor and severity added there). */
export interface TraceStep {
  action: 'translate_request' | 'restore_answer';
  detail: Record<string, unknown>;
}

/** What the retry loop knows about the call's logging: the client and the sink. */
export interface TraceStepLog {
  clientId: string | null;
  sink?: 'db' | { file: string };
}

/**
 * The translation steps are trace rows of a client, so they need a client id
 * and the DB sink; the evals harness (file sink) and client-less calls get
 * none.
 */
export function traceStepsEnabled(log: TraceStepLog | undefined): boolean {
  return Boolean(log && log.clientId && (!log.sink || log.sink === 'db'));
}

/** The `translate_request` step of a call, or null when the provider sends the request as declared. */
export function translateStepOf(translation: Translation | null, purpose: string, model: string): TraceStep | null {
  if (!translation) return null;
  return { action: 'translate_request', detail: translationStepDetail(translation, purpose, model) };
}

/** The `restore_answer` step of a call, or null when the adapter changed nothing in the answer. */
export function restoreStepOf(response: unknown, provider: string, purpose: string, model: string): TraceStep | null {
  const filled = restoredFieldsOf(response);
  if (!filled) return null;
  return { action: 'restore_answer', detail: { provider, purpose, model, filled } };
}

/**
 * Every translation step one call records, in trace order (the call row sits
 * between the two). The decision table the tests pin: Anthropic schema stage
 * → both; OpenAI → translate only; Gemini → none; no client or file sink → none.
 */
export function traceStepsOf(
  provider: string,
  request: TranslatableRequest,
  log: TraceStepLog | undefined,
  purpose: string,
  response: unknown,
): TraceStep[] {
  if (!traceStepsEnabled(log)) return [];
  const steps: TraceStep[] = [];
  const translate = translateStepOf(translationOf(provider, request), purpose, request.model);
  if (translate) steps.push(translate);
  const restore = restoreStepOf(response, provider, purpose, request.model);
  if (restore) steps.push(restore);
  return steps;
}
