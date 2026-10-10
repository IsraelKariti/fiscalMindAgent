import type { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { CheckContext, ChecksVerdict, ExtractedAnswer } from '../verifyChecks.js';

/**
 * One document type's complete extraction contract (openspec
 * `document-extraction`, change `per-type-document-schemas`): the answer
 * schema the model is forced through, the system prompt it reads, the type's
 * own fields (for the trace labels and the evals judge) and the type's own
 * verification — the ordered list of code checks over the answer. One module
 * per catalog type under this folder, plus `generic` for ad-hoc rows; the
 * registry (index.ts) resolves a checklist row's type key to its module.
 */

/** How a type-specific extraction field is typed in the model's answer. */
export type FieldKind = 'text' | 'number' | 'date' | 'year';

/**
 * One extra field a document type reads beside the common fields. The prompt
 * line for it is written out in the module's prompt; this entry carries what
 * the code needs: the key, the kind (value normalisation), the trace label and
 * the required / pattern rules of the `type_fields` check.
 */
export interface TypeField {
  /** Stable key in the answer object; must not collide with a common field key. */
  key: string;
  kind: FieldKind;
  /** Short Hebrew label shown in the trace and the documentation. */
  labelHe: string;
  /** A null value fails the `type_fields` check. */
  required: boolean;
  /** Text fields only: the value must match (after trimming). */
  pattern?: RegExp;
  /** The `type_fields` note when the pattern fails. */
  patternHintHe?: string;
}

export interface DocumentTypeSpec {
  /** The catalog key, or 'generic' for rows without a catalog type. */
  key: string;
  /** The full flat answer object — the common fields plus this type's own, written out. */
  schema: z.ZodType<ExtractedAnswer, z.ZodTypeDef, unknown>;
  /** `schema` as the JSON schema the model receives (`$schema` removed), computed once at module load. */
  jsonSchema: Record<string, unknown>;
  /**
   * The whole system prompt. Only the values that vary per checklist row stay
   * as placeholders: {{expected_name}}, {{expected_description}},
   * {{paper_context}} and {{tax_year}} — buildExtractionCall fills them.
   */
  prompt: string;
  /** This type's own fields, in answer order; empty for a type with none. */
  fields: readonly TypeField[];
  /** At least one of these field keys must be read (a type whose items are different papers). */
  fieldsAnyOf?: readonly string[];
  /** The type's verification: the checks it runs over the answer, in trace order. */
  verify(answer: ExtractedAnswer, ctx: CheckContext): ChecksVerdict;
}

/** JSON schema for the model (`$schema` removed), from the module's zod object. */
export function jsonSchemaOf(schema: z.ZodTypeAny): Record<string, unknown> {
  const json = zodToJsonSchema(schema) as Record<string, unknown>;
  delete json.$schema;
  return json;
}
