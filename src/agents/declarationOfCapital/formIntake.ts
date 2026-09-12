import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { runLlmCall } from '../../gemini/llmCall.js';
import { recordAudit } from '../../audit/audit.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { sanitizeInline, sanitizeUntrusted } from '../shared/promptSafety.js';
import { runInjectionRegexStep, screenForInjection } from '../shared/injectionScreen.js';
import { logger } from '../../util/logger.js';
import { getCatalogType } from './catalog.js';
import { buildFormIntakeCall } from './formIntakeCall.js';
import { validateFormResolutions, type FormAnswer, type FormResolvableRow } from './formIntakeRules.js';
import type { ClientRow } from '../../db/types.js';

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

/**
 * Runs the form pre-resolution for one just-enrolled (or restarted) client:
 * reads the seeded unresolved rows, asks the model to map the form answers
 * onto them, validates, applies, audits. Throws only on total failure (model /
 * DB); the caller treats that as "no pre-resolution" and lets the interview
 * cover everything.
 */
export async function applyFormIntake(
  client: ClientRow,
  formAnswers: FormAnswer[],
  taxYear: number,
): Promise<{ applied: number }> {
  const answers = formAnswers
    .map((a) => ({
      question: sanitizeInline(a.question, 300),
      answer: sanitizeUntrusted(a.answer, 4000),
    }))
    .filter((a) => a.question !== '');
  const answered = answers.filter((a) => a.answer !== '');
  const emptyQuestions = answers.filter((a) => a.answer === '').map((a) => a.question);
  // A form with no filled answer at all is treated as not really submitted —
  // nothing is resolved (in particular the blank questions), the interview
  // covers everything.
  if (answered.length === 0) return { applied: 0 };

  // The three injection layers BEFORE the mapping call: the mapping model
  // carries no detection duty, so nothing untrusted may reach it unscreened.
  // Step 1, regex (no model): a hit stops the intake here — the model never
  // sees the text. Step 2, the dedicated LLM screen + step 3, its code gate.
  // Fails closed — a screen failure (throw) aborts the intake the same way a
  // suspected injection does, and the interview covers everything.
  const screenCtx = {
    userId: client.user_id,
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    source: 'form_intake' as const,
  };
  const snippets = answered.map((a) => `${a.question}: ${a.answer}`);
  const regexHit = runInjectionRegexStep(snippets.join('\n'), screenCtx);
  const screen = regexHit
    ? { suspected: true, evidence: regexHit.evidence, detector: 'regex' as const, kind: regexHit.kind }
    : { ...(await screenForInjection(snippets, screenCtx)), detector: 'llm' as const, kind: null };
  if (screen.suspected) {
    logger.warn('form intake: injection screen flagged the form answers — intake skipped', { clientId: client.id, detector: screen.detector });
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
        detector: screen.detector,
        kind: screen.kind,
        ...(screen.evidence ? { evidence: screen.evidence.slice(0, 500) } : {}),
      },
    });
    return { applied: 0 };
  }

  const documents = await clientDocuments.listForClient(client.id);
  const rows: FormResolvableRow[] = documents
    .filter((d) => d.status === 'unresolved' && d.type_key !== null)
    .map((d) => ({
      id: d.id,
      typeKey: d.type_key as string,
      multiInstance: getCatalogType(d.type_key as string)?.multiInstance ?? false,
    }));
  if (rows.length === 0) return { applied: 0 };

  const { spec, schema: intakeSchema } = buildFormIntakeCall({ answered, emptyQuestions, rows, taxYear });
  const { text, usage, model } = await runLlmCall(spec, {
    log: { userId: client.user_id, agentInstanceId: client.agent_instance_id, clientId: client.id },
  });
  if (client.user_id) {
    await llmUsage.add(client.user_id, client.agent_instance_id, model, usage);
  }
  const raw = intakeSchema.parse(JSON.parse(text));

  const { valid, dropped, unclear, checks } = validateFormResolutions(raw, rows, answers);
  // Step validate_form_resolutions: code checks every proposal. true = all
  // accepted, false = at least one dropped (a dropped row stays unresolved —
  // no retry, the interview covers it).
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
  if (applied > 0) publishClientUpdated(client.id);
  logger.info('form intake applied', { clientId: client.id, applied, proposed: Object.keys(raw.verdicts).length });
  return { applied };
}
