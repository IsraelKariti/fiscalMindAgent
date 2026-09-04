import { z } from 'zod';

/**
 * The pure contract of the form pre-resolution (formIntake.ts): the model's
 * output schema and the code-side validation of its proposals. Kept free of
 * db/LLM imports so tests can exercise the rules directly.
 */

/** One question/answer pair of the submitted form (monday column title + cell text; '' = left empty). */
export interface FormAnswer {
  question: string;
  answer: string;
}

// Injection detection is NOT this schema's job: the answers are screened by
// a dedicated pre-call (shared/injectionScreen.ts) before the mapping runs.

/**
 * The response schema, built PER CALL, in three flat parts kept deliberately
 * light for Anthropic's structured-output grammar compiler (a full per-key
 * entry object, inlined 17 times, was rejected as "compiled grammar too
 * large"; nullable/optional fields hit the 24-optional cap before that — so:
 * everything required, empty string / empty array means "absent"):
 *
 *  - `verdicts` — one REQUIRED enum property per type key still unresolved
 *    for this client. The model cannot skip a type (answering every key is
 *    the schema, 'unclear' is the explicit way out) and cannot name a row
 *    that doesn't exist.
 *  - `evidence` — one row per not_required verdict: the form question it
 *    rests on and the verbatim quote ('' when the question was left empty).
 *  - `instances` — one row per concrete document of a required verdict.
 */
export function buildFormIntakeSchema(typeKeys: readonly [string, ...string[]]) {
  return z.object({
    verdicts: z.object(
      Object.fromEntries(typeKeys.map((k) => [k, z.enum(['required', 'not_required', 'unclear'])])),
    ),
    evidence: z.array(z.object({ type_key: z.enum(typeKeys), question: z.string(), quote: z.string() })),
    instances: z.array(z.object({ type_key: z.enum(typeKeys), name: z.string(), description: z.string() })),
  });
}

export type FormIntakeVerdict = 'required' | 'not_required' | 'unclear';

export interface FormIntakeResponse {
  verdicts: Record<string, FormIntakeVerdict>;
  evidence: { type_key: string; question: string; quote: string }[];
  instances: { type_key: string; name: string; description: string }[];
}

/** Hard cap on concrete instances one resolution may create — same bound as the interview validator. */
export const MAX_FORM_INSTANCES = 10;

/** Whitespace-insensitive containment (the same rule the interview evidence uses). */
function quoteAppearsIn(quote: string, text: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const q = norm(quote);
  return q.length > 0 && norm(text).includes(q);
}

/** One seeded checklist row a form resolution may settle. */
export interface FormResolvableRow {
  id: string;
  typeKey: string;
  multiInstance: boolean;
}

export type ValidatedFormResolution =
  | {
      documentId: string;
      typeKey: string;
      resolution: 'not_required';
      evidence:
        | { source: 'form'; question: string; quote: string }
        | { source: 'form_empty'; question: string };
    }
  | { documentId: string; typeKey: string; resolution: 'required'; instances: { name: string; description: string | null }[] };

/**
 * Validates the model's per-type verdicts against the seeded rows and the
 * actual form answers. Invalid entries are dropped (with the reason collected)
 * rather than failing the whole pass — a dropped row simply stays unresolved
 * and the WhatsApp interview covers it, exactly like an explicit 'unclear'
 * (returned separately for logging). Duplicates are impossible now (object
 * keys are unique); an unknown key can only appear if the provider ignored
 * the schema, and is still dropped.
 */
export function validateFormResolutions(
  raw: FormIntakeResponse,
  rows: FormResolvableRow[],
  answers: FormAnswer[],
): { valid: ValidatedFormResolution[]; dropped: string[]; unclear: string[] } {
  const byTypeKey = new Map(rows.map((r) => [r.typeKey, r]));
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const allAnswersText = answers
    .filter((a) => a.answer !== '')
    .map((a) => a.answer)
    .join('\n');
  // Questions the client left blank — "I don't have this" — the only ones a
  // quote-less not_required may rest on.
  const emptyQuestions = new Set(answers.filter((a) => a.answer === '').map((a) => norm(a.question)));
  const valid: ValidatedFormResolution[] = [];
  const dropped: string[] = [];
  const unclear: string[] = [];

  for (const [typeKey, verdict] of Object.entries(raw.verdicts)) {
    const row = byTypeKey.get(typeKey);
    if (!row) {
      dropped.push(`${typeKey}: not an unresolved catalog row of this client`);
      continue;
    }
    if (verdict === 'unclear') {
      unclear.push(typeKey);
      continue;
    }

    if (verdict === 'not_required') {
      const proof = raw.evidence.find((e) => e.type_key === typeKey);
      if (!proof) {
        dropped.push(`${typeKey}: not_required without an evidence row`);
        continue;
      }
      const question = proof.question.trim();
      if (question === '') {
        dropped.push(`${typeKey}: not_required without a question`);
        continue;
      }
      const quote = proof.quote.trim();
      if (quote === '') {
        // Quote-less resolution: valid only when the named question really was
        // left empty on the form (empty cell = the client doesn't have this).
        if (!emptyQuestions.has(norm(question))) {
          dropped.push(`${typeKey}: quote-less not_required but the question was not left empty`);
          continue;
        }
        valid.push({
          documentId: row.id,
          typeKey: row.typeKey,
          resolution: 'not_required',
          evidence: { source: 'form_empty', question: question.slice(0, 300) },
        });
        continue;
      }
      if (!quoteAppearsIn(quote, allAnswersText)) {
        dropped.push(`${typeKey}: quote not found verbatim in the form answers`);
        continue;
      }
      valid.push({
        documentId: row.id,
        typeKey: row.typeKey,
        resolution: 'not_required',
        evidence: { source: 'form', question: question.slice(0, 300), quote: quote.slice(0, 500) },
      });
      continue;
    }

    const instances = raw.instances
      .filter((i) => i.type_key === typeKey)
      .map((i) => ({
        name: i.name.trim(),
        description: i.description.trim() || null,
      }));
    if (instances.length === 0) {
      dropped.push(`${typeKey}: required without instances`);
      continue;
    }
    if (instances.some((i) => i.name.length === 0 || i.name.length > 200)) {
      dropped.push(`${typeKey}: instance name out of 1-200 chars`);
      continue;
    }
    if (instances.length > 1 && !row.multiInstance) {
      dropped.push(`${typeKey}: multiple instances on a single-instance type`);
      continue;
    }
    if (instances.length > MAX_FORM_INSTANCES) {
      dropped.push(`${typeKey}: more than ${MAX_FORM_INSTANCES} instances`);
      continue;
    }
    valid.push({ documentId: row.id, typeKey: row.typeKey, resolution: 'required', instances });
  }
  return { valid, dropped, unclear };
}
