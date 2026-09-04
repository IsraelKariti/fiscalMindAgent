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
 * The response schema, built PER CALL: `type_key` is an enum of exactly the
 * type keys still unresolved for this client, so the model cannot name a row
 * that doesn't exist (or misspell one) — a wrong key is impossible at
 * generation time instead of dropped after the fact.
 */
export function buildFormIntakeSchema(typeKeys: readonly [string, ...string[]]) {
  return z.object({
    resolutions: z.array(
      z.object({
        /** Catalog type key the resolution settles — one of this client's open rows. */
        type_key: z.enum(typeKeys),
        resolution: z.enum(['required', 'not_required']),
        /** For 'required' only: one entry per concrete document instance. */
        instances: z.array(z.object({ name: z.string(), description: z.string().nullable() })).nullable(),
        /** The form question the decision rests on. */
        question: z.string(),
        /** Verbatim quote from the client's answer to that question; null when the question was left empty. */
        quote: z.string().nullable(),
      }),
    ),
  });
}

export type FormIntakeResponse = z.infer<ReturnType<typeof buildFormIntakeSchema>>;

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
 * Validates the model's proposed resolutions against the seeded rows and the
 * actual form answers. Invalid entries are dropped (with the reason collected)
 * rather than failing the whole pass — a dropped row simply stays unresolved
 * and the WhatsApp interview covers it.
 */
export function validateFormResolutions(
  raw: FormIntakeResponse,
  rows: FormResolvableRow[],
  answers: FormAnswer[],
): { valid: ValidatedFormResolution[]; dropped: string[] } {
  const byTypeKey = new Map(rows.map((r) => [r.typeKey, r]));
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const allAnswersText = answers
    .filter((a) => a.answer !== '')
    .map((a) => a.answer)
    .join('\n');
  // Questions the client left blank — "I don't have this" — the only ones a
  // quote-less not_required may rest on.
  const emptyQuestions = new Set(answers.filter((a) => a.answer === '').map((a) => norm(a.question)));
  const seen = new Set<string>();
  const valid: ValidatedFormResolution[] = [];
  const dropped: string[] = [];

  for (const entry of raw.resolutions) {
    const row = byTypeKey.get(entry.type_key);
    if (!row) {
      dropped.push(`${entry.type_key}: not an unresolved catalog row of this client`);
      continue;
    }
    if (seen.has(entry.type_key)) {
      dropped.push(`${entry.type_key}: targeted twice`);
      continue;
    }
    seen.add(entry.type_key);

    if (entry.resolution === 'not_required') {
      const quote = entry.quote?.trim() ?? '';
      if (quote === '') {
        // Quote-less resolution: valid only when the named question really was
        // left empty on the form (empty cell = the client doesn't have this).
        if (!emptyQuestions.has(norm(entry.question))) {
          dropped.push(`${entry.type_key}: quote-less not_required but the question was not left empty`);
          continue;
        }
        valid.push({
          documentId: row.id,
          typeKey: row.typeKey,
          resolution: 'not_required',
          evidence: { source: 'form_empty', question: entry.question.slice(0, 300) },
        });
        continue;
      }
      if (!quoteAppearsIn(quote, allAnswersText)) {
        dropped.push(`${entry.type_key}: quote not found verbatim in the form answers`);
        continue;
      }
      valid.push({
        documentId: row.id,
        typeKey: row.typeKey,
        resolution: 'not_required',
        evidence: { source: 'form', question: entry.question.slice(0, 300), quote: quote.slice(0, 500) },
      });
      continue;
    }

    const instances = (entry.instances ?? []).map((i) => ({
      name: i.name.trim(),
      description: i.description?.trim() || null,
    }));
    if (instances.length === 0) {
      dropped.push(`${entry.type_key}: required without instances`);
      continue;
    }
    if (instances.some((i) => i.name.length === 0 || i.name.length > 200)) {
      dropped.push(`${entry.type_key}: instance name out of 1-200 chars`);
      continue;
    }
    if (instances.length > 1 && !row.multiInstance) {
      dropped.push(`${entry.type_key}: multiple instances on a single-instance type`);
      continue;
    }
    if (instances.length > MAX_FORM_INSTANCES) {
      dropped.push(`${entry.type_key}: more than ${MAX_FORM_INSTANCES} instances`);
      continue;
    }
    valid.push({ documentId: row.id, typeKey: row.typeKey, resolution: 'required', instances });
  }
  return { valid, dropped };
}
