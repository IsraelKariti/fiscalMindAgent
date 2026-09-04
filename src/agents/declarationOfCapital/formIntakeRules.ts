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

/** One per-type verdict inside `resolutions` (the type key is the object key). */
const formIntakeEntrySchema = z.object({
  /** 'unclear' = the form doesn't settle this type — it stays for the WhatsApp interview. */
  resolution: z.enum(['required', 'not_required', 'unclear']),
  /** For 'required' only: one entry per concrete document instance. */
  instances: z.array(z.object({ name: z.string(), description: z.string().nullable() })).nullable(),
  /** The form question the decision rests on; null for 'unclear'. */
  question: z.string().nullable(),
  /** Verbatim quote from the client's answer to that question; null when the question was left empty. */
  quote: z.string().nullable(),
});

export type FormIntakeEntry = z.infer<typeof formIntakeEntrySchema>;

/**
 * The response schema, built PER CALL: `resolutions` is an object with one
 * REQUIRED property per type key still unresolved for this client. The model
 * therefore cannot skip a type (every key must be answered — 'unclear' is the
 * explicit way out) and cannot name a row that doesn't exist.
 */
export function buildFormIntakeSchema(typeKeys: readonly [string, ...string[]]) {
  return z.object({
    resolutions: z.object(Object.fromEntries(typeKeys.map((k) => [k, formIntakeEntrySchema]))),
  });
}

export interface FormIntakeResponse {
  resolutions: Record<string, FormIntakeEntry>;
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

  for (const [typeKey, entry] of Object.entries(raw.resolutions)) {
    const row = byTypeKey.get(typeKey);
    if (!row) {
      dropped.push(`${typeKey}: not an unresolved catalog row of this client`);
      continue;
    }
    if (entry.resolution === 'unclear') {
      unclear.push(typeKey);
      continue;
    }

    if (entry.resolution === 'not_required') {
      const question = entry.question?.trim() ?? '';
      if (question === '') {
        dropped.push(`${typeKey}: not_required without a question`);
        continue;
      }
      const quote = entry.quote?.trim() ?? '';
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

    const instances = (entry.instances ?? []).map((i) => ({
      name: i.name.trim(),
      description: i.description?.trim() || null,
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
