import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { CAPITAL_DOCUMENT_PAPER_VALUES } from './catalog.js';
import type { DecisionContext, DecisionResponse } from './decisionSchema.js';

/**
 * The planner's tools (openspec `planner-answer-tools`).
 *
 * One deep JSON form made Anthropic's structured-output compiler refuse every
 * planner call ("The compiled grammar is too large", measured 2026-10-14: the
 * stated-cost sub-form nested four levels deep in two lists). Instead the
 * model is offered small tools, each with a FLAT parameter list — every
 * parameter required, never nullable, never an object or a list of objects.
 *
 * Since 2026-11-27 the planner is a tool loop (gemini/toolLoop.ts): every
 * turn's calls are judged and executed at once and answered with their real
 * result, and the run ends on an accepted TERMINAL call — a message
 * (`send_whatsapp_text` / `send_whatsapp_template`), `goal_complete` or
 * `client_declined`. There is no `conclude` and no decision label.
 * `assembleCalls` turns the calls of one unit (one or a few calls that belong
 * together) into the raw `DecisionResponse` the validators read, so
 * `normalizeChanges` stays the single business-rule authority.
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
export const DOCUMENT_FETCH_ACTIONS = ['client_agreed', 'start_login', 'cancel'] as const;

/** One planner tool: its name, the one-line description the model reads, and its flat parameter schema. */
export interface DecisionTool {
  name: DecisionToolName;
  description: string;
  params: z.ZodObject<z.ZodRawShape>;
}

const REASONING_PARAM = { reasoning: z.string().describe('Short reasoning for how this run ends, in Hebrew.') };

/** The four tools whose accepted call ends the run. */
export const TERMINAL_TOOL_NAMES = ['send_whatsapp_text', 'send_whatsapp_template', 'goal_complete', 'client_declined'] as const;
export type TerminalToolName = (typeof TERMINAL_TOOL_NAMES)[number];

const TERMINAL_TOOLS: DecisionTool[] = [
  {
    name: 'send_whatsapp_text',
    description:
      'Schedule the one free-form WhatsApp message of this run (only while the 24h window is open) and END the run. Call it after the results of your other calls (a tie returns its verification verdict).',
    params: z
      .object({
        text: z.string().describe('The message text, plain text.'),
        send_at: z.string().describe('"YYYY-MM-DD HH:MM" in the accountant\'s timezone, or "asap" for a reply to a client who is waiting now.'),
        ...REASONING_PARAM,
      })
      .strict(),
  },
  {
    name: 'send_whatsapp_template',
    description: 'Schedule the one approved WhatsApp template message of this run (the only option outside the 24h window) and END the run.',
    params: z
      .object({
        template_id: z.string().describe('The template id from the WHATSAPP CHANNEL section.'),
        variables: z.array(z.string()).describe('The {{n}} variable values, exactly as many as the template needs.'),
        send_at: z.string().describe('"YYYY-MM-DD HH:MM" in the accountant\'s timezone, or "asap".'),
        ...REASONING_PARAM,
      })
      .strict(),
  },
  {
    name: 'goal_complete',
    description:
      'END the run with the goal complete: every checklist row is approved / stated / not_required AND the client confirmed the attestation summary. The system sends the fixed closing message; no send_* call.',
    params: z.object({ ...REASONING_PARAM }).strict(),
  },
  {
    name: 'client_declined',
    description:
      'END the run: the client refused the WhatsApp collection in words. Call it alone — no message, no tie, no checklist change; the system sends the fixed acknowledgement.',
    params: z.object({ ...REASONING_PARAM }).strict(),
  },
];

const ALWAYS_TOOLS: DecisionTool[] = [
  ...TERMINAL_TOOLS,
  {
    name: 'ask_team',
    description:
      "Ask the client's team member at the office one question you cannot settle yourself (office practice, an unusual document, a tax judgement). Before this run's message, which tells the client you will check with the office (send_at \"asap\"); never while a question is still open (see TEAM QUESTIONS).",
    params: z
      .object({
        question: z.string().describe('The question for the team member, in Hebrew, self-contained.'),
        why: z.string().describe("Why you cannot answer it yourself, in one or two sentences; '' when obvious."),
        evidence_message_id: z.string().describe("Id of the client's inbound message that raised it; '' when none."),
      })
      .strict(),
  },
  {
    name: 'mark_collected',
    description: 'A required document the client provided without a file in this thread (handed to the office another way); it waits for the accountant as "claimed".',
    params: z.object({ document_id: z.string() }).strict(),
  },
  {
    name: 'tie_file',
    description:
      'A received file IS this required document. The system verifies the document at once and the result is the verdict (approved with the facts read / rejected with the reasons / not yet checked). Evidence ("" / "") is needed only when the code cannot confirm the company of the file or of the item.',
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
    name: 'set_required',
    description:
      "Settle an unresolved catalog row on the client's explicit words: required (then add_instance for each concrete item) or not_required. For required only, a self-evident file (its content analysis says so) may stand instead of the quote: then exactly one of the evidence pair or proven_by_file_id is non-empty.",
    params: z
      .object({
        document_id: z.string(),
        resolution: z.enum(['required', 'not_required']),
        ...EVIDENCE_PARAMS,
        proven_by_file_id: z
          .string()
          .describe("Id of a SELF-EVIDENT file (marked so in its content analysis) that proves the one instance of this required row; '' otherwise."),
      })
      .strict(),
  },
  {
    name: 'add_instance',
    description:
      'One concrete item under a catalog row: a row resolved required in this same turn, or an already-resolved row. Exactly one of the evidence pair or proven_by_file_id is non-empty. The result names the id of the row it created.',
    params: z
      .object({
        anchor_document_id: z.string().describe('The catalog row this item belongs to.'),
        name: z.string().describe('Specific item name, including the company for a bank/fund/policy.'),
        description: z.string().describe("Short description; '' when none."),
        already_provided: z.boolean().describe('The office already holds this document (claimed).'),
        file_ids: z.array(z.string()).describe('Ids of already-received files that ARE this document; [] when none.'),
        paper_key: z.enum(PAPER_KEY_VALUES).describe("The paper this item stands for; '' for a type without papers."),
        ...EVIDENCE_PARAMS,
        proven_by_file_id: z
          .string()
          .describe(
            "Instead of the evidence pair: the id of a SELF-EVIDENT file (marked so in its content analysis) that IS this item, or of an APPROVED purchase contract whose proven seller kind calls for this item; '' otherwise.",
          ),
      })
      .strict(),
  },
  {
    name: 'state_cost',
    description:
      'A purchase cost the client stated in the chat for a PROPERTY cost-declaration item (paper cost_declaration only — a vehicle is stated with state_vehicle, never here): an existing item (document_id set, instance_name ""), or an item added in this same turn (document_id "", instance_name = that add_instance name); an item added in an earlier turn is named by the id its result returned.',
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
    name: 'state_vehicle',
    description:
      "Vehicle facts the client stated in the chat for a client-vehicle-declaration item (paper vehicle_declaration): an existing item (document_id set, instance_name \"\") — pending, or already stated when adding facts — or an item added in this same turn (document_id \"\", instance_name = that add_instance name). Give ONLY facts the client wrote in the quoted message, spelled as there — the car's name in the item name or the questionnaire is not a quote and must stay ''; '' / 0 = not stated. All empty with a quote = the client knows nothing more (the item still closes).",
    params: z
      .object({
        document_id: z.string(),
        instance_name: z.string(),
        manufacturer: z.string().describe("The make as the client wrote it; '' when not stated."),
        model: z.string().describe("The model as the client wrote it; '' when not stated."),
        production_year: z.number().describe('Four-digit production year; 0 when not stated.'),
        license_plate: z.string().describe("The plate, digits only; '' when not stated."),
        purchase_cost: z.number().describe('The purchase cost as a number; 0 when not stated.'),
        currency: z.string().describe("Three-letter code; ILS unless the client named another currency; '' when no cost."),
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
    name: 'set_company',
    description:
      'The company that manages a pending fund / account / policy row whose line says "חברה: לא ידועה", on the client\'s words: the row keeps its id and status and its name gains the company. One row per call; a further company the client names for the same row is an add_instance.',
    params: z
      .object({
        document_id: z.string(),
        company: z.string().describe('The company as the client named it.'),
        ...EVIDENCE_PARAMS,
      })
      .strict(),
  },
  {
    name: 'attestation',
    description:
      'The final-confirmation gate: request — this run\'s message IS the closing summary (evidence "" / ""; every row already settled, nothing changed in this run); confirmed — the client confirmed the summary (evidence required).',
    params: z
      .object({
        action: z.enum(ATTESTATION_ACTIONS),
        ...EVIDENCE_PARAMS,
      })
      .strict(),
  },
];
const DOCUMENT_FETCH_TOOL: DecisionTool = {
  name: 'document_fetch',
  description: 'A document-fetch step for one provider (see the DOCUMENT FETCH sections for the actions allowed now). Applied together with this run\'s message.',
  params: z
    .object({
      action: z.enum(DOCUMENT_FETCH_ACTIONS),
      provider: z.string().describe('The provider id of a DOCUMENT FETCH section.'),
      document_keys: z.array(z.string()).describe("The provider's document-type keys the client agreed to; [] = all pending."),
    })
    .strict(),
};

export const DECISION_TOOL_NAMES = [
  'send_whatsapp_text',
  'send_whatsapp_template',
  'goal_complete',
  'client_declined',
  'mark_collected',
  'tie_file',
  'set_required',
  'add_instance',
  'state_cost',
  'state_vehicle',
  'retire_document',
  'set_company',
  'attestation',
  'document_fetch',
  'ask_team',
] as const;
export type DecisionToolName = (typeof DECISION_TOOL_NAMES)[number];

export function isTerminalTool(name: string): name is TerminalToolName {
  return (TERMINAL_TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * The tools offered for one run: the full set minus what this client cannot
 * use (no intake → no checklist tools; no fetch provider → no document_fetch).
 * The terminal tools, ask_team, mark_collected and tie_file are always offered.
 */
export function toolsForContext(ctx: DecisionContext): DecisionTool[] {
  return [...ALWAYS_TOOLS, ...(ctx.intake ? INTAKE_TOOLS : []), ...((ctx.documentFetch ?? []).length > 0 ? [DOCUMENT_FETCH_TOOL] : [])];
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
  /** The provider's call id, when it gives one. */
  id?: string;
  /** The model turn that made the call (1-based). */
  turn?: number;
}

/** A call whose arguments passed its tool's schema. */
export interface ParsedToolCall {
  name: DecisionToolName;
  args: Record<string, unknown>;
  id?: string;
  turn?: number;
  /** The call's position in its turn (0-based): the loop maps results back by it. */
  index?: number;
}

/** A call the `tool_calls` check refused: not an offered tool, or arguments that do not match the tool's schema. */
export interface ShapeFault {
  index: number;
  call: ToolCall;
  /** The tool's name when the tool exists (a step can be recorded under it); null for an unknown tool. */
  tool: DecisionToolName | null;
  reason: string;
}

/**
 * The `tool_calls` check of one turn, per call: every call names an offered
 * tool and its arguments match that tool's schema. Calls that pass are
 * returned parsed (with their turn position); the others as faults, each with
 * the reason the model is answered with.
 */
export function parseTurnCalls(calls: readonly ToolCall[], tools: readonly DecisionTool[]): { accepted: ParsedToolCall[]; faults: ShapeFault[] } {
  const byName = new Map(tools.map((t) => [t.name as string, t]));
  const accepted: ParsedToolCall[] = [];
  const faults: ShapeFault[] = [];
  calls.forEach((call, index) => {
    const tool = byName.get(call.name);
    if (!tool) {
      const hint = call.name === 'conclude' ? ` — there is no conclude: the run ends on a terminal tool (${TERMINAL_TOOL_NAMES.join(', ')})` : '';
      faults.push({ index, call, tool: null, reason: `tool "${call.name}" is not offered in this request${hint} — the tools are: ${tools.map((t) => t.name).join(', ')}` });
      return;
    }
    const result = tool.params.safeParse(call.args ?? {});
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue && issue.path.length > 0 ? ` at ${issue.path.join('.')}` : '';
      faults.push({ index, call, tool: tool.name, reason: `tool "${call.name}"${where}: ${issue?.message ?? 'invalid arguments'}` });
      return;
    }
    accepted.push({ name: tool.name, args: result.data as Record<string, unknown>, index, ...(call.id !== undefined ? { id: call.id } : {}), ...(call.turn !== undefined ? { turn: call.turn } : {}) });
  });
  return { accepted, faults };
}

/**
 * The fixed safe order the calls of one turn execute in (openspec
 * `conversation-trace`): checklist changes, then the attestation, then ties
 * and collections, then the team question, then the fetch action, then the
 * terminal call. Stable within a group.
 */
const EXECUTION_ORDER: Record<DecisionToolName, number> = {
  set_required: 0,
  set_company: 1,
  add_instance: 2,
  retire_document: 3,
  state_cost: 4,
  state_vehicle: 5,
  attestation: 6,
  tie_file: 7,
  mark_collected: 8,
  ask_team: 9,
  document_fetch: 10,
  send_whatsapp_text: 11,
  send_whatsapp_template: 11,
  goal_complete: 11,
  client_declined: 11,
};

export function inExecutionOrder<T extends { name: DecisionToolName }>(calls: readonly T[]): T[] {
  return [...calls].sort((a, b) => EXECUTION_ORDER[a.name] - EXECUTION_ORDER[b.name]);
}

/** The checklist tools: judged and applied as units (a resolution with the instances added under it, an addition with its stated cost). */
const CHECKLIST_TOOLS: ReadonlySet<DecisionToolName> = new Set(['set_required', 'set_company', 'add_instance', 'retire_document', 'state_cost', 'state_vehicle', 'attestation']);

export function isChecklistTool(name: DecisionToolName): boolean {
  return CHECKLIST_TOOLS.has(name);
}

/**
 * The units of a turn's checklist calls, each judged on its own so that one
 * refused call never undoes its neighbours: a `set_required(required)` with
 * the `add_instance` calls anchored on its row (and their `state_cost` /
 * `state_vehicle` by instance name); the remaining `add_instance` calls per
 * anchor with their statements; every other checklist call alone. A duplicate
 * target in one turn is its own unit, refused by assembly. A statement that
 * names an instance no `add_instance` of the turn has is its own unit too, and
 * assembly refuses it by name.
 */
export function checklistUnits(calls: readonly ParsedToolCall[]): ParsedToolCall[][] {
  const used = new Set<ParsedToolCall>();
  const units: ParsedToolCall[][] = [];
  const str = (v: unknown) => (typeof v === 'string' ? v : '');
  const statementsFor = (instanceNames: Set<string>) =>
    calls.filter((c) => !used.has(c) && (c.name === 'state_cost' || c.name === 'state_vehicle') && str(c.args.document_id).trim() === '' && instanceNames.has(str(c.args.instance_name).trim()));
  const seenResolved = new Set<string>();
  for (const call of calls) {
    if (used.has(call) || call.name !== 'set_required') continue;
    const id = str(call.args.document_id);
    used.add(call);
    if (seenResolved.has(id)) {
      units.push([call]); // the duplicate: assembly refuses it
      continue;
    }
    seenResolved.add(id);
    const unit = [call];
    if (call.args.resolution === 'required') {
      const own = calls.filter((c) => !used.has(c) && c.name === 'add_instance' && str(c.args.anchor_document_id) === id);
      own.forEach((c) => used.add(c));
      unit.push(...own);
      const statements = statementsFor(new Set(own.map((c) => str(c.args.name).trim())));
      statements.forEach((c) => used.add(c));
      unit.push(...statements);
    }
    units.push(unit);
  }
  const anchors = [...new Set(calls.filter((c) => !used.has(c) && c.name === 'add_instance').map((c) => str(c.args.anchor_document_id)))];
  for (const anchor of anchors) {
    const own = calls.filter((c) => !used.has(c) && c.name === 'add_instance' && str(c.args.anchor_document_id) === anchor);
    own.forEach((c) => used.add(c));
    const statements = statementsFor(new Set(own.map((c) => str(c.args.name).trim())));
    statements.forEach((c) => used.add(c));
    units.push([...own, ...statements]);
  }
  for (const call of calls) {
    if (used.has(call) || !CHECKLIST_TOOLS.has(call.name)) continue;
    used.add(call);
    units.push([call]);
  }
  return units;
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
const NO_VEHICLE = { manufacturer: '', model: '', production_year: 0, license_plate: '', purchase_cost: 0, currency: '', message_id: '', quote: '' };

/**
 * Turns the parsed calls of one unit (or of a whole turn's ties) into the raw
 * form `normalizeChanges` reads. Throws a plain Error for the within-unit
 * rules (a resolution twice for one row, a statement naming exactly one
 * target, an unknown instance name, more than one attestation or fetch call);
 * those surface as the unit's refusal.
 */
export function assembleCalls(calls: readonly ParsedToolCall[]): DecisionResponse {
  const of = (name: DecisionToolName) => calls.filter((c) => c.name === name).map((c) => c.args);

  const attestations = of('attestation');
  if (attestations.length > 1) throw new Error('attestation must be called at most once per turn');
  const attestation = attestations[0];

  const fetches = of('document_fetch');
  if (fetches.length > 1) throw new Error('document_fetch must be called at most once per turn');
  const fetch = fetches[0];

  const asks = of('ask_team');
  if (asks.length > 1) throw new Error('ask_team must be called at most once per run — one question per run');
  const ask = asks[0];

  // Instances: under a row this unit resolves `required` they are that resolution's instances;
  // otherwise one added_instances entry per anchor (the validator rejects two entries on one anchor).
  const resolved = of('set_required');
  const resolvedIds = new Set(resolved.map((r) => str(r.document_id)));
  const seenResolved = new Set<string>();
  for (const r of resolved) {
    const id = str(r.document_id);
    if (seenResolved.has(id)) throw new Error(`set_required was called twice for document ${id} in this turn — resolve each row once`);
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
      stated_vehicle: { ...NO_VEHICLE },
    } as RawInstance,
  }));

  // Stated costs: for an existing item, or for an instance added in this turn (by name).
  const statedCosts: DecisionResponse['stated_costs'] = [];
  for (const s of of('state_cost')) {
    const documentId = str(s.document_id).trim();
    const instanceName = str(s.instance_name).trim();
    if ((documentId === '') === (instanceName === '')) {
      throw new Error('state_cost names exactly one target: document_id for an existing item, or instance_name for an item added in this turn');
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
        `state_cost names instance "${instanceName}" but no add_instance call of this turn has that name — use the exact name of the add_instance call of the same turn, or the document id an earlier turn's add_instance result returned`,
      );
    }
    target.instance.stated_cost = { amount, currency, message_id: evidence.message_id, quote: evidence.quote };
  }

  // Vehicle statements (openspec `vehicle-declaration`): for an existing item, or for an instance added in this turn (by name).
  const statedVehicles: DecisionResponse['stated_vehicles'] = [];
  for (const v of of('state_vehicle')) {
    const documentId = str(v.document_id).trim();
    const instanceName = str(v.instance_name).trim();
    if ((documentId === '') === (instanceName === '')) {
      throw new Error('state_vehicle names exactly one target: document_id for an existing item, or instance_name for an item added in this turn');
    }
    const num = (x: unknown): number => (typeof x === 'number' ? x : Number(x) || 0);
    const facts = {
      manufacturer: str(v.manufacturer),
      model: str(v.model),
      production_year: num(v.production_year),
      license_plate: str(v.license_plate),
      purchase_cost: num(v.purchase_cost),
      currency: str(v.currency),
    };
    const evidence = evidenceOf(v) ?? { message_id: '', quote: '' };
    if (documentId !== '') {
      statedVehicles.push({ document_id: documentId, ...facts, evidence });
      continue;
    }
    const target = instances.find((i) => i.instance.name.trim() === instanceName);
    if (!target) {
      throw new Error(
        `state_vehicle names instance "${instanceName}" but no add_instance call of this turn has that name — use the exact name of the add_instance call of the same turn, or the document id an earlier turn's add_instance result returned`,
      );
    }
    target.instance.stated_vehicle = { ...facts, message_id: evidence.message_id, quote: evidence.quote };
  }

  const resolvedDocuments: NonNullable<DecisionResponse['resolved_documents']> = resolved.map((r) => {
    const id = str(r.document_id);
    const resolution = r.resolution === 'required' ? ('required' as const) : ('not_required' as const);
    const own = instances.filter((i) => i.anchor === id);
    return {
      document_id: id,
      resolution,
      instances: resolution === 'required' ? own.map((i) => i.instance) : null,
      evidence: evidenceOf(r),
      // The self-evident file may be cited on the set_required call or on its one add_instance.
      proven_by_file_id: str(r.proven_by_file_id) || own.find((i) => i.provenByFileId !== '')?.provenByFileId || '',
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

  // Company clarifications (openspec `item-company-clarification`): one row per call; the gate checks the rest.
  const setCompanies: NonNullable<DecisionResponse['set_companies']> = of('set_company').map((c) => ({
    document_id: str(c.document_id),
    company: str(c.company),
    evidence: evidenceOf(c),
  }));

  const fetchKeys = fetch ? strs(fetch.document_keys) : null;
  return {
    collected_document_ids: [...new Set(of('mark_collected').map((m) => str(m.document_id)))],
    matched_files: of('tie_file').map((t) => ({ file_id: str(t.file_id), document_id: str(t.document_id), evidence: evidenceOf(t) })),
    document_fetch_action: fetch ? (str(fetch.action) as DecisionResponse['document_fetch_action']) : null,
    document_fetch_provider: fetch ? str(fetch.provider) : null,
    document_fetch_document_keys: fetchKeys && fetchKeys.length > 0 ? fetchKeys : null,
    resolved_documents: resolvedDocuments.length > 0 ? resolvedDocuments : null,
    added_instances: additions.size > 0 ? [...additions.values()] : null,
    retired_documents: retired.length > 0 ? retired : null,
    ...(setCompanies.length > 0 ? { set_companies: setCompanies } : {}),
    stated_costs: statedCosts,
    stated_vehicles: statedVehicles,
    attestation: attestation ? (str(attestation.action) as DecisionResponse['attestation']) : null,
    attestation_evidence: attestation ? evidenceOf(attestation) : null,
    team_question: ask ? { question: str(ask.question), why: str(ask.why), evidence_message_id: str(ask.evidence_message_id) } : null,
  };
}

/** `observed` of the tool_calls check: the number of calls and their tool names. */
export function describeCalls(calls: readonly ToolCall[]): string {
  return calls.length === 0 ? '0 calls' : `${calls.length} call${calls.length === 1 ? '' : 's'}: ${calls.map((c) => c.name).join(', ')}`;
}

/** The key parameters of a call as the gate row's `observed` shows them: ids with the names the caller resolves, capped. */
export function describeCall(call: ParsedToolCall, nameOf: (id: string) => string | undefined): string {
  const parts: string[] = [];
  for (const key of ['document_id', 'anchor_document_id', 'file_id', 'instance_name', 'resolution', 'action', 'provider', 'send_at', 'template_id', 'company'] as const) {
    const v = call.args[key];
    if (typeof v !== 'string' || v === '') continue;
    const name = key.endsWith('_id') ? nameOf(v) : undefined;
    parts.push(`${key}: ${v}${name ? ` (${name})` : ''}`);
  }
  if (typeof call.args.text === 'string') parts.push(`text: ${call.args.text.length} chars`);
  return `${call.name}${parts.length > 0 ? ` — ${parts.join(', ')}` : ''}`.slice(0, 500);
}

/**
 * The one corrective user turn of a run (openspec `planner-answer-tools`, "A
 * run ends with exactly one ending"): sent after a turn without calls while no
 * terminal call was accepted. It states the ending rule and nothing else.
 */
export function endingCorrectionNote(): string {
  return [
    'SYSTEM NOTE: your last turn made no tool call, and this run has no ending yet. Your text is NOT sent to the client — only a tool call acts.',
    `End the run with exactly one terminal tool: send_whatsapp_text (inside the 24h window) or send_whatsapp_template, with the full message and its send_at (a future "YYYY-MM-DD HH:MM", or "asap" for a client who is waiting right now); goal_complete only when every document is settled and the attestation is confirmed; client_declined only when the client refused the WhatsApp collection in words.`,
    '"No message needed" is never a valid state: when there is nothing new to say, schedule a gentle reminder. Make the calls now.',
  ].join('\n');
}
