import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { runLlmCall } from '../../gemini/llmCall.js';
import { recordAudit } from '../../audit/audit.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { sanitizeInline, sanitizeUntrusted } from '../shared/promptSafety.js';
import { runInjectionScreen } from '../shared/injectionScreen.js';
import { logger } from '../../util/logger.js';
import { getCatalogType } from './catalog.js';
import { buildFormIntakeCall } from './formIntakeCall.js';
import {
  validateFormResolutions,
  type FormAnswer,
  type FormIntakeResponse,
  type FormResolvableRow,
  type ValidatedFormResolution,
} from './formIntakeRules.js';
import type { ClientRow, InjectionBlock } from '../../db/types.js';

export type { FormAnswer } from './formIntakeRules.js';

/**
 * Pre-resolution of the intake checklist from the client's submitted
 * questionnaire (the office's monday WorkForm): the form answers are THE
 * source of which documents this declaration needs, so before the first
 * WhatsApp message goes out, one isolated Gemini read maps them onto the
 * catalog-seeded 'unresolved' rows — explicit "no" answers become not_required
 * (with the verbatim answer as evidence), questions the client left empty also
 * become not_required (an empty cell means "I don't have this"; evidence is
 * the blank question itself), and so does an item a combined question names
 * but its partial answer never mentions (evidence: the full answer). Concrete
 * assets become 1..N pending rows (one per bank account / property / vehicle
 * / fund...), and only an ambiguous answer stays unresolved for the WhatsApp
 * interview to cover.
 *
 * Same trust doctrine as the interview path: the model proposes, code
 * validates (formIntakeRules.ts) — a resolution may only target a seeded
 * unresolved row, a not_required needs a verbatim quote that actually appears
 * in the form answers (or, quote-less, a question that really was left
 * empty), instance counts obey the catalog. Answers are
 * client-typed text and therefore untrusted: they are sanitized before
 * prompting, and a dedicated injection-screen pre-call
 * (shared/injectionScreen.ts) must clear them before the mapping call runs —
 * the mapping model itself carries no detection duty.
 */

// The prompt and the request builder live in formIntakeCall.ts (pure — no DB /
// event-bus imports) so the evals harness and the stage page can build the
// exact request; re-exported here for the call sites that historically
// imported them from this module.
export { buildFormIntakeCall, FORM_INTAKE_PROMPT, type FormIntakeCallInput } from './formIntakeCall.js';

/** The sanitized form: the filled answers, and the questions the client left empty. */
interface SanitizedForm {
  answers: FormAnswer[];
  answered: FormAnswer[];
  emptyQuestions: string[];
}

/**
 * Runs the form pre-resolution for one just-enrolled (or restarted) client:
 * reads the seeded unresolved rows, asks the model to map the form answers
 * onto them, validates, applies, audits. Throws only on total failure (model /
 * DB); the caller treats that as "no pre-resolution" and lets the interview
 * cover everything.
 *
 * One named function per step: sanitizeFormAnswers, screenFormAnswersForAttackText,
 * loadResolvableRows, mapFormToChecklist (questionnaire_schema_mapping),
 * gateFormResolutions (validate_form_resolutions), applyFormResolutions.
 */
export async function applyFormIntake(
  client: ClientRow,
  formAnswers: FormAnswer[],
  taxYear: number,
): Promise<{ applied: number }> {
  const form = sanitizeFormAnswers(formAnswers);
  if (form.answered.length === 0) return { applied: 0 };
  const block = await screenFormAnswersForAttackText(client, form.answered);
  if (block) {
    recordFormIntakeSuppressed(client, block);
    return { applied: 0 };
  }
  const rows = await loadResolvableRows(client);
  if (rows.length === 0) return { applied: 0 };
  const raw = await mapFormToChecklist(client, form, rows, taxYear);
  const valid = gateFormResolutions(client, raw, rows, form.answers);
  const applied = await applyFormResolutions(client, valid);
  if (applied > 0) publishClientUpdated(client.id);
  logger.info('form intake applied', { clientId: client.id, applied, proposed: Object.keys(raw.verdicts).length });
  return { applied };
}

/**
 * The answers as the model will see them (sanitized, capped), split into
 * filled answers and empty questions. A form with no filled answer at all is
 * treated as not really submitted — nothing is resolved (in particular the
 * blank questions), the interview covers everything.
 */
function sanitizeFormAnswers(formAnswers: readonly FormAnswer[]): SanitizedForm {
  const answers = formAnswers
    .map((a) => ({
      question: sanitizeInline(a.question, 300),
      answer: sanitizeUntrusted(a.answer, 4000),
    }))
    .filter((a) => a.question !== '');
  return {
    answers,
    answered: answers.filter((a) => a.answer !== ''),
    emptyQuestions: answers.filter((a) => a.answer === '').map((a) => a.question),
  };
}

/** The checklist rows the form may settle: still unresolved, with a catalog type. */
async function loadResolvableRows(client: ClientRow): Promise<FormResolvableRow[]> {
  const documents = await clientDocuments.listForClient(client.id);
  return documents
    .filter((d) => d.status === 'unresolved' && d.type_key !== null)
    .map((d) => ({
      id: d.id,
      typeKey: d.type_key as string,
      multiInstance: getCatalogType(d.type_key as string)?.multiInstance ?? false,
    }));
}

/** The questionnaire_schema_mapping call: the model maps the answers onto the open rows; the answer is forced through the per-client schema. */
async function mapFormToChecklist(client: ClientRow, form: SanitizedForm, rows: FormResolvableRow[], taxYear: number): Promise<FormIntakeResponse> {
  const { spec, schema: intakeSchema } = buildFormIntakeCall({ answered: form.answered, emptyQuestions: form.emptyQuestions, rows, taxYear });
  const { text, usage, model } = await runLlmCall(spec, {
    log: { userId: client.user_id, agentInstanceId: client.agent_instance_id, clientId: client.id },
  });
  if (client.user_id) {
    await llmUsage.add(client.user_id, client.agent_instance_id, model, usage);
  }
  return intakeSchema.parse(JSON.parse(text));
}

/**
 * Step validate_form_resolutions: code checks every proposal
 * (validateFormResolutions, pure) and writes the step row. true = all
 * accepted, false = at least one dropped (a dropped row stays unresolved —
 * no retry, the interview covers it). Returns the accepted resolutions.
 */
function gateFormResolutions(client: ClientRow, raw: FormIntakeResponse, rows: FormResolvableRow[], answers: FormAnswer[]): ValidatedFormResolution[] {
  const { valid, dropped, unclear, checks } = validateFormResolutions(raw, rows, answers);
  recordAudit({
    actorType: 'system',
    action: 'validate_form_resolutions',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    severity: dropped.length > 0 ? 'warning' : 'info',
    detail: {
      clientName: client.name,
      result: dropped.length === 0,
      proposed: Object.keys(raw.verdicts).length,
      accepted: valid.map((v) => ({ typeKey: v.typeKey, resolution: v.resolution })),
      unclear,
      dropped,
      checks,
    },
  });
  if (dropped.length > 0) {
    logger.warn('form intake: some proposed resolutions were dropped', { clientId: client.id, dropped });
  }
  if (unclear.length > 0) {
    logger.info('form intake: types left for the interview', { clientId: client.id, unclear });
  }
  return valid;
}

/** Writes the accepted resolutions to the checklist, one document.resolved audit row each. Returns how many landed. */
async function applyFormResolutions(client: ClientRow, valid: readonly ValidatedFormResolution[]): Promise<number> {
  let applied = 0;
  for (const resolution of valid) {
    if (resolution.resolution === 'not_required') {
      const row = await clientDocuments.resolveNotRequired(resolution.documentId, client.id, resolution.evidence);
      if (!row) continue;
      applied += 1;
      recordAudit({
        actorType: 'agent',
        action: 'document.resolved',
        agentInstanceId: client.agent_instance_id,
        clientId: client.id,
        targetType: 'client_document',
        targetId: row.id,
        detail: {
          clientName: client.name,
          name: row.name,
          typeKey: row.type_key,
          resolution: 'not_required',
          evidence: resolution.evidence,
          source: 'form_intake',
        },
      });
    } else {
      const created = await clientDocuments.resolveRequired(resolution.documentId, client.id, resolution.instances);
      if (!created) continue;
      applied += 1;
      recordAudit({
        actorType: 'agent',
        action: 'document.resolved',
        agentInstanceId: client.agent_instance_id,
        clientId: client.id,
        targetType: 'client_document',
        targetId: resolution.documentId,
        detail: {
          clientName: client.name,
          typeKey: resolution.typeKey,
          resolution: 'required',
          instances: created.map((r) => r.name),
          source: 'form_intake',
        },
      });
    }
  }
  return applied;
}

/**
 * The injection screen over the filled answers (runInjectionScreen): a regex
 * hit stops the intake before any model sees the text; else the dedicated LLM
 * screen and its code gate. Fails closed — a screen failure (throw) aborts
 * the intake the same way a hit does, and the interview covers everything.
 */
async function screenFormAnswersForAttackText(client: ClientRow, answered: readonly FormAnswer[]): Promise<InjectionBlock | null> {
  return runInjectionScreen(
    { text: answered.map((a) => `${a.question}: ${a.answer}`) },
    { userId: client.user_id, agentInstanceId: client.agent_instance_id, clientId: client.id, source: 'form_intake' },
    { onFailure: 'throw' },
  );
}

/** The intake is skipped: one audit row says every state change of this cycle is suppressed. */
function recordFormIntakeSuppressed(client: ClientRow, block: InjectionBlock): void {
  logger.warn('form intake: injection screen flagged the form answers — intake skipped', { clientId: client.id, detector: block.detector });
  recordAudit({
    actorType: 'agent',
    action: 'injection.cycle_suppressed',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    severity: 'critical',
    suspectedInjection: true,
    detail: {
      agent: 'declaration_of_capital',
      clientName: client.name,
      source: 'form_intake_screen',
      detector: block.detector,
      kind: block.kind,
      ...(block.evidence ? { evidence: block.evidence.slice(0, 500) } : {}),
    },
  });
}
