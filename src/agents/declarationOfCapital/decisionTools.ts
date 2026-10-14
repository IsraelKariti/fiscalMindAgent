import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { check, type GateCheck } from '../shared/gateChecks.js';
import { CAPITAL_DOCUMENT_PAPER_VALUES } from './catalog.js';
import {
  AFTER_VERIFICATION_DECISION_VALUES,
  DECISION_VALUES,
  DecisionRejectedError,
  normalizeDecision,
  type DecisionContext,
  type DecisionResponse,
  type NormalizedDecision,
} from './decisionSchema.js';

/**
 * The planner's answer as tool calls (openspec `planner-answer-tools`).
 *
 * One deep JSON form made Anthropic's structured-output compiler refuse every
 * planner call ("The compiled grammar is too large", measured 2026-10-14: the
 * stated-cost sub-form nested four levels deep in two lists). Instead the
 * model is offered small tools, each with a FLAT parameter list — every
 * parameter required, never nullable, never an object or a list of objects —
 * and answers with one or more calls, `conclude` among them (one turn on
 * Gemini/Anthropic; OpenAI is asked again until `conclude`, see llmCall.ts).
 * `assembleDecision`
 * turns the calls into the raw `DecisionResponse` the form used to deliver,
 * so `normalizeDecision` stays the single business-rule authority.
 *
 * "None" is the empty value of the parameter's type: '' for text, [] for a
 * list, 0 for a number. The shape test (tests/decisionTools.test.ts) fails
 * when a tool breaks these rules.
 */

/** The closed paper list an instance may name, plus '' for a type without papers (openspec `document-papers`). */
const PAPER_KEY_VALUES = ['', ...CAPITAL_DOCUMENT_PAPER_VALUES] as [string, ...string[]];

const EVIDENCE_PARAMS = {
  evidence_message_id: z.string().describe("Id of the client's inbound message this rests on; '' when none."),
  evidence_quote: z.string().describe("Verbatim quote from that message; '' when none."),
};

export const ATTESTATION_ACTIONS = ['request', 'confirmed'] as const;
export const TAX_FETCH_ACTIONS = ['client_agreed', 'start_login', 'cancel'] as const;

/** One planner tool: its name, the one-line description the model reads, and its flat parameter schema. */
export interface DecisionTool {
  name: DecisionToolName;
  description: string;
  params: z.ZodObject<z.ZodRawShape>;
}

const concludeTool = (values: readonly [string, ...string[]]): DecisionTool => ({
  name: 'conclude',
  description: 'The decision of this answer and the reasoning behind it. Call exactly once per answer.',
  params: z
    .object({
      decision: z.enum(values),
      reasoning: z.string().describe('Short reasoning for the whole answer.'),
    })
    .strict(),
});

const ALWAYS_TOOLS: DecisionTool[] = [
  {
    name: 'send_whatsapp_text',
    description: 'Schedule one free-form WhatsApp message (only while the 24h window is open). A follow_up carries exactly one send_* call.',
    params: z
      .object({
        text: z.string().describe('The message text, plain text.'),
        send_at: z.string().describe('"YYYY-MM-DD HH:MM" in the accountant\'s timezone, or "asap" for a reply to a client who is waiting now.'),
      })
      .strict(),
  },
  {
    name: 'send_whatsapp_template',
    description: 'Schedule one approved WhatsApp template message (the only option outside the 24h window). A follow_up carries exactly one send_* call.',
    params: z
      .object({
        template_id: z.string().describe('The template id from the WHATSAPP CHANNEL section.'),
        variables: z.array(z.string()).describe('The {{n}} variable values, exactly as many as the template needs.'),
        send_at: z.string().describe('"YYYY-MM-DD HH:MM" in the accountant\'s timezone, or "asap".'),
      })
      .strict(),
  },
];

const COLLECT_TOOLS: DecisionTool[] = [
  {
    name: 'mark_collected',
    description: 'A required document the client provided without a file in this thread (handed to the office another way); it waits for the accountant as "claimed".',
    params: z.object({ document_id: z.string() }).strict(),
  },
  {
    name: 'tie_file',
    description: 'A received file IS this required document. Evidence ("" / "") is needed only when the code cannot confirm the company of the file or of the item.',
    params: z
      .object({
        file_id: z.string(),
        document_id: z.string(),
        ...EVIDENCE_PARAMS,
      })
      .strict(),
  },
];

const INTAKE_TOOLS: DecisionTool[] = [
  {
    name: 'resolve_document',
    description: "Settle an unresolved catalog row on the client's explicit words: required (then add_instance for each concrete item) or not_required.",
    params: z
      .object({
        document_id: z.string(),
        resolution: z.enum(['required', 'not_required']),
        ...EVIDENCE_PARAMS,
      })
      .strict(),
  },
  {
    name: 'add_instance',
    description:
      'One concrete item under a catalog row: a row resolved required in this same answer, or an already-resolved row. Exactly one of the evidence pair or proven_by_file_id is non-empty.',
    params: z
      .object({
        anchor_document_id: z.string().describe('The catalog row this item belongs to.'),
        name: z.string().describe('Specific item name, including the company for a bank/fund/policy.'),
        description: z.string().describe("Short description; '' when none."),
        already_provided: z.boolean().describe('The office already holds this document (claimed).'),
        file_ids: z.array(z.string()).describe('Ids of already-received files that ARE this document; [] when none.'),
        paper_key: z.enum(PAPER_KEY_VALUES).describe("The paper this item stands for; '' for a type without papers."),
        ...EVIDENCE_PARAMS,
        proven_by_file_id: z.string().describe("Id of an APPROVED purchase contract whose proven seller kind calls for this item; '' otherwise."),
      })
      .strict(),
  },
  {
    name: 'state_cost',
    description:
      'A purchase cost the client stated in the chat for a cost-declaration item: an existing item (document_id set, instance_name "") or an item added in this answer (document_id "", instance_name = that add_instance name).',
    params: z
      .object({
        document_id: z.string(),
        instance_name: z.string(),
        amount: z.number().describe('The amount as a number.'),
        currency: z.string().describe('Three-letter code; ILS unless the client named another currency.'),
        ...EVIDENCE_PARAMS,
      })
      .strict(),
  },
  {
    name: 'retire_document',
    description: 'Remove a checklist row the requirements ladder replaced. Exactly one of the evidence pair or proven_by_file_id is non-empty.',
    params: z
      .object({
        document_id: z.string(),
        ...EVIDENCE_PARAMS,
        proven_by_file_id: z.string().describe("Id of an APPROVED purchase contract whose proven seller kind calls for this retirement; '' otherwise."),
      })
      .strict(),
  },
  {
    name: 'attestation',
    description:
      'The final-confirmation gate: request — this answer\'s message IS the closing summary (evidence "" / ""); confirmed — the client confirmed the summary (evidence required).',
    params: z
      .object({
        action: z.enum(ATTESTATION_ACTIONS),
        ...EVIDENCE_PARAMS,
      })
      .strict(),
  },
];

const TAX_FETCH_TOOL: DecisionTool = {
  name: 'tax_fetch',
  description: 'A document-fetch step for one provider (see the DOCUMENT FETCH sections for the actions allowed now).',
  params: z
    .object({
      action: z.enum(TAX_FETCH_ACTIONS),
      provider: z.string().describe('The provider id of a DOCUMENT FETCH section.'),
      document_keys: z.array(z.string()).describe("The provider's document-type keys the client agreed to; [] = all pending."),
    })
    .strict(),
};

export const DECISION_TOOL_NAMES = [
  'conclude',
  'send_whatsapp_text',
  'send_whatsapp_template',
  'mark_collected',
  'tie_file',
  'resolve_document',
  'add_instance',
  'state_cost',
  'retire_document',
  'attestation',
  'tax_fetch',
] as const;
export type DecisionToolName = (typeof DECISION_TOOL_NAMES)[number];

/**
 * The tools offered for one call: the full set minus what this client cannot
 * use (no intake → no checklist tools; no fetch provider → no tax_fetch; the
 * follow-up cycle after a verification batch → no collecting tools and no
 * 'collect' value). conclude and the two send_* tools are always offered.
 */
export function toolsForContext(ctx: DecisionContext): DecisionTool[] {
  const values = ctx.afterVerification ? AFTER_VERIFICATION_DECISION_VALUES : DECISION_VALUES;
  return [
    concludeTool(values as unknown as readonly [string, ...string[]]),
    ...ALWAYS_TOOLS,
    ...(ctx.afterVerification ? [] : COLLECT_TOOLS),
    ...(ctx.intake ? INTAKE_TOOLS : []),
    ...((ctx.taxFetch ?? []).length > 0 ? [TAX_FETCH_TOOL] : []),
  ];
}

/** The cache key of a context's tool set. */
export function decisionToolsKey(ctx: DecisionContext): string {
  return toolsForContext(ctx)
    .map((t) => t.name)
    .join(',');
}

/** A tool as sent to a provider: name, description, flat JSON-schema parameters. */
export interface DecisionToolJson {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** The JSON schema of one tool's parameters: sub-schemas inlined, `$schema` removed, no extra keys. */
export function toolParametersJsonSchema(tool: DecisionTool): Record<string, unknown> {
  const json = zodToJsonSchema(tool.params as never, { $refStrategy: 'none' }) as Record<string, unknown>;
  delete json.$schema;
  json.additionalProperties = false;
  return json;
}

export function toolJsonSchemas(ctx: DecisionContext): DecisionToolJson[] {
  return toolsForContext(ctx).map((t) => ({ name: t.name, description: t.description, parameters: toolParametersJsonSchema(t) }));
}

/** One call as a provider returns it: the tool name and its raw arguments. */
export interface ToolCall {
  name: string;
  args: unknown;
}

/** A call whose arguments passed its tool's schema. */
export interface ParsedToolCall {
  name: DecisionToolName;
  args: Record<string, unknown>;
}

/**
 * The `tool_calls` check: at least one call, every call names an offered
 * tool, every call's arguments match that tool's schema, and `conclude` is
 * called exactly once. Throws a plain Error with the first fault.
 */
export function parseToolCalls(calls: ToolCall[], tools: DecisionTool[]): ParsedToolCall[] {
  if (calls.length === 0) throw new Error('the answer must be one or more tool calls — none was made');
  const byName = new Map(tools.map((t) => [t.name as string, t]));
  const parsed: ParsedToolCall[] = [];
  for (const call of calls) {
    const tool = byName.get(call.name);
    if (!tool) {
      throw new Error(`tool "${call.name}" is not offered in this request — the tools are: ${tools.map((t) => t.name).join(', ')}`);
    }
    const result = tool.params.safeParse(call.args ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
      throw new Error(`tool "${call.name}"${where}: ${issue?.message ?? 'invalid arguments'}`);
    }
    parsed.push({ name: tool.name, args: result.data as Record<string, unknown> });
  }
  const concludes = parsed.filter((c) => c.name === 'conclude').length;
  if (concludes !== 1) throw new Error(`conclude must be called exactly once per answer (got ${concludes})`);
  return parsed;
}

type Evidence = { message_id: string; quote: string } | null;
const evidenceOf = (args: Record<string, unknown>): Evidence => {
  const id = String(args.evidence_message_id ?? '');
  const quote = String(args.evidence_quote ?? '');
  return id === '' && quote === '' ? null : { message_id: id, quote };
};
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

type RawInstance = NonNullable<NonNullable<DecisionResponse['added_instances']>[number]['instances']>[number];
const NO_COST = { amount: 0, currency: '', message_id: '', quote: '' };

/**
 * Turns the parsed calls of one answer into the raw form `normalizeDecision`
 * reads. Throws a plain Error for the call-count rules (one send_* at most,
 * one attestation at most, one tax_fetch at most, a state_cost naming exactly
 * one target, an unknown instance name); those surface as `business_rules`.
 */
export function assembleDecision(calls: ParsedToolCall[]): DecisionResponse {
  const of = (name: DecisionToolName) => calls.filter((c) => c.name === name).map((c) => c.args);
  const conclude = of('conclude')[0];
  if (!conclude) throw new Error('conclude must be called exactly once per answer (got 0)');

  const texts = of('send_whatsapp_text');
  const templates = of('send_whatsapp_template');
  if (texts.length + templates.length > 1) {
    throw new Error(
      `a follow_up carries exactly one message: ${texts.length} send_whatsapp_text and ${templates.length} send_whatsapp_template calls were made — keep one`,
    );
  }
  const text = texts[0];
  const template = templates[0];
  if (str(conclude.decision) === 'follow_up' && !text && !template) {
    throw new Error('a follow_up needs exactly one WhatsApp message: call send_whatsapp_text (inside the 24h window) or send_whatsapp_template, with its send_at');
  }

  const attestations = of('attestation');
  if (attestations.length > 1) throw new Error('attestation must be called at most once per answer');
  const attestation = attestations[0];

  const fetches = of('tax_fetch');
  if (fetches.length > 1) throw new Error('tax_fetch must be called at most once per answer');
  const fetch = fetches[0];

  // Instances: under a row this answer resolves `required` they are that resolution's instances;
  // otherwise one added_instances entry per anchor (the validator rejects two entries on one anchor).
  const resolved = of('resolve_document');
  const resolvedIds = new Set(resolved.map((r) => str(r.document_id)));
  const seenResolved = new Set<string>();
  for (const r of resolved) {
    const id = str(r.document_id);
    if (seenResolved.has(id)) throw new Error(`resolve_document was called twice for document ${id} — resolve each row once`);
    seenResolved.add(id);
  }
  const instanceCalls = of('add_instance');
  const instances = instanceCalls.map((a) => ({
    anchor: str(a.anchor_document_id),
    evidence: evidenceOf(a),
    provenByFileId: str(a.proven_by_file_id),
    instance: {
      name: str(a.name),
      description: str(a.description).trim() === '' ? null : str(a.description),
      already_provided: Boolean(a.already_provided),
      file_ids: strs(a.file_ids),
      paper_key: str(a.paper_key),
      stated_cost: { ...NO_COST },
    } as RawInstance,
  }));

  // Stated costs: for an existing item, or for an instance added in this answer (by name).
  const statedCosts: DecisionResponse['stated_costs'] = [];
  for (const s of of('state_cost')) {
    const documentId = str(s.document_id).trim();
    const instanceName = str(s.instance_name).trim();
    if ((documentId === '') === (instanceName === '')) {
      throw new Error('state_cost names exactly one target: document_id for an existing item, or instance_name for an item added in this answer');
    }
    const amount = typeof s.amount === 'number' ? s.amount : Number(s.amount);
    const currency = str(s.currency);
    const evidence = evidenceOf(s) ?? { message_id: '', quote: '' };
    if (documentId !== '') {
      statedCosts.push({ document_id: documentId, amount, currency, evidence });
      continue;
    }
    const target = instances.find((i) => i.instance.name.trim() === instanceName);
    if (!target) {
      throw new Error(
        `state_cost names instance "${instanceName}" but no add_instance call of this answer has that name — use the exact name of the add_instance call`,
      );
    }
    target.instance.stated_cost = { amount, currency, message_id: evidence.message_id, quote: evidence.quote };
  }

  const resolvedDocuments: NonNullable<DecisionResponse['resolved_documents']> = resolved.map((r) => {
    const id = str(r.document_id);
    const resolution = r.resolution === 'required' ? ('required' as const) : ('not_required' as const);
    return {
      document_id: id,
      resolution,
      instances: resolution === 'required' ? instances.filter((i) => i.anchor === id).map((i) => i.instance) : null,
      evidence: evidenceOf(r),
    };
  });

  const additions = new Map<string, NonNullable<DecisionResponse['added_instances']>[number]>();
  for (const i of instances) {
    if (resolvedIds.has(i.anchor)) continue;
    const group = additions.get(i.anchor) ?? { anchor_document_id: i.anchor, instances: [], evidence: null, proven_by_file_id: '' };
    group.instances.push(i.instance);
    if (group.evidence === null && i.evidence) group.evidence = i.evidence;
    if (group.proven_by_file_id === '' && i.provenByFileId !== '') group.proven_by_file_id = i.provenByFileId;
    additions.set(i.anchor, group);
  }

  const retired: NonNullable<DecisionResponse['retired_documents']> = of('retire_document').map((r) => ({
    document_id: str(r.document_id),
    evidence: evidenceOf(r),
    proven_by_file_id: str(r.proven_by_file_id),
  }));

  const sendAt = text ? str(text.send_at) : template ? str(template.send_at) : null;
  const fetchKeys = fetch ? strs(fetch.document_keys) : null;
  return {
    decision: str(conclude.decision) as DecisionResponse['decision'],
    reasoning: str(conclude.reasoning),
    collected_document_ids: [...new Set(of('mark_collected').map((m) => str(m.document_id)))],
    matched_files: of('tie_file').map((t) => ({ file_id: str(t.file_id), document_id: str(t.document_id), evidence: evidenceOf(t) })),
    whatsapp_text: text ? str(text.text) : null,
    whatsapp_template: template ? { template_id: str(template.template_id), variables: strs(template.variables) } : null,
    send_at: sendAt === '' ? null : sendAt,
    tax_fetch_action: fetch ? (str(fetch.action) as DecisionResponse['tax_fetch_action']) : null,
    tax_fetch_provider: fetch ? str(fetch.provider) : null,
    tax_fetch_document_keys: fetchKeys && fetchKeys.length > 0 ? fetchKeys : null,
    resolved_documents: resolvedDocuments.length > 0 ? resolvedDocuments : null,
    added_instances: additions.size > 0 ? [...additions.values()] : null,
    retired_documents: retired.length > 0 ? retired : null,
    stated_costs: statedCosts,
    attestation: attestation ? (str(attestation.action) as DecisionResponse['attestation']) : null,
    attestation_evidence: attestation ? evidenceOf(attestation) : null,
  };
}

/** The message kind the calls propose, read the way normalization reads it; '—' when they carry none. */
function proposedKind(calls: ParsedToolCall[]): 'freeform' | 'template' | '—' {
  if (calls.some((c) => c.name === 'send_whatsapp_text')) return 'freeform';
  if (calls.some((c) => c.name === 'send_whatsapp_template')) return 'template';
  return '—';
}

/** `observed` of the tool_calls check: the number of calls and their tool names. */
export function describeCalls(calls: ToolCall[]): string {
  return calls.length === 0 ? '0 calls' : `${calls.length} call${calls.length === 1 ? '' : 's'}: ${calls.map((c) => c.name).join(', ')}`;
}

/**
 * Step validate_message, pure: the model's calls through the two checks in
 * order — `tool_calls` (offered tools, per-tool schema, exactly one conclude)
 * then `business_rules` (assembly + normalizeDecision). Returns the decision
 * with the check list; throws DecisionRejectedError carrying the checks that
 * ran. The stated-cost checks the validators report on their own are listed
 * between the two.
 */
export function gateDecision(calls: ToolCall[], ctx: DecisionContext): { decision: NormalizedDecision; checks: GateCheck[] } {
  const messageOf = (err: unknown): string => (err instanceof Error ? err.message : String(err)).slice(0, 500);
  const observed = describeCalls(calls);
  let parsed: ParsedToolCall[];
  try {
    parsed = parseToolCalls(calls, toolsForContext(ctx));
  } catch (err) {
    const message = messageOf(err);
    throw new DecisionRejectedError(message, [check('tool_calls', false, message, { observed })]);
  }
  const toolCheck = check('tool_calls', true, null, { observed });
  const conclude = parsed.find((c) => c.name === 'conclude')!;
  const proposed = `${str(conclude.args.decision)} / ${proposedKind(parsed)}`;
  const extra: GateCheck[] = [];
  try {
    const raw = assembleDecision(parsed);
    const decision = normalizeDecision(raw, ctx, extra);
    return { decision, checks: [toolCheck, ...extra, check('business_rules', true, null, { observed: proposed })] };
  } catch (err) {
    const message = messageOf(err);
    throw new DecisionRejectedError(message, [toolCheck, ...extra, check('business_rules', false, message, { observed: proposed })]);
  }
}

/**
 * Appended to the original contents for decide()'s corrective pass: the
 * rejected calls, the rejection, and the tool rules the model most often
 * breaks (one conclude; a follow_up has exactly one send_* call; a collect
 * ties a file and has no send_* call).
 */
export function correctionSuffix(calls: ToolCall[], err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return [
    '',
    'SYSTEM NOTE: your previous answer was rejected by validation and was NOT executed.',
    'Your rejected tool calls:',
    JSON.stringify(calls),
    `Validation error: ${message}`,
    'Answer again with corrected tool calls, all in this one answer. Call conclude exactly once. Remember the three decision values: "collect" when the answer ties a file to a document (mark_collected, tie_file, or an add_instance with file_ids) — then make NO send_whatsapp_text / send_whatsapp_template call, the reply is written in the next cycle; "follow_up" when nothing is tied — then the answer MUST include exactly one WhatsApp message (send_whatsapp_text inside the 24h window, or send_whatsapp_template) with its send_at — a future "YYYY-MM-DD HH:MM" time, or "asap" for a reply to a client who is waiting right now — "no message needed" is never a valid state and when there is nothing new to say you schedule a gentle reminder instead; "goal_complete" only when every document is settled and the attestation is confirmed.',
  ].join('\n');
}
