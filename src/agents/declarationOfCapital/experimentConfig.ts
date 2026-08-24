import { z } from 'zod';
import { LLM_MODEL_OPTIONS, LLM_CALL_PURPOSES, type LlmCallPurpose } from '../../gemini/modelCatalog.js';

/**
 * The admin LLM A/B experiment config stored in agent_instances.llm_experiment
 * (049). Pure module (no env/DB imports) so the schema's invariants are
 * testable; the runtime behavior around it lives in experiment.ts.
 */

// An arm may pin a different model to each call site; unpinned purposes use
// the arm's default `model`.
export { LLM_CALL_PURPOSES, type LlmCallPurpose } from '../../gemini/modelCatalog.js';

const PurposeModelsSchema = z
  .object({
    conversation_decide: z.enum(LLM_MODEL_OPTIONS).optional(),
    form_intake: z.enum(LLM_MODEL_OPTIONS).optional(),
    analyze_file: z.enum(LLM_MODEL_OPTIONS).optional(),
    verify_document: z.enum(LLM_MODEL_OPTIONS).optional(),
  })
  .strict();

export const LlmExperimentSchema = z
  .object({
    enabled: z.boolean(),
    arms: z
      .array(
        z
          .object({
            key: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/),
            /** The arm's default model — used by every call site not pinned in `models`. */
            model: z.enum(LLM_MODEL_OPTIONS),
            /** Per-call-site overrides; absent (older stored configs) = all on `model`. */
            models: PurposeModelsSchema.optional(),
            /** NULL = the built-in prompt.md template. Same placeholders as the built-in. */
            promptTemplate: z.string().min(1).max(100_000).nullable(),
          })
          .strict(),
      )
      .min(1)
      .max(4),
  })
  .strict()
  .refine((e) => new Set(e.arms.map((a) => a.key)).size === e.arms.length, {
    message: 'arm keys must be unique',
  });

export type LlmExperimentConfig = z.infer<typeof LlmExperimentSchema>;

/** Fail-closed parse of a stored value: null (no experiment) unless the shape is valid. */
export function parseExperimentValue(
  value: unknown,
): { config: LlmExperimentConfig; error: null } | { config: null; error: string | null } {
  if (value === null || value === undefined) return { config: null, error: null };
  const parsed = LlmExperimentSchema.safeParse(value);
  return parsed.success ? { config: parsed.data, error: null } : { config: null, error: parsed.error.message };
}

export type LlmExperimentArm = LlmExperimentConfig['arms'][number];

/** The model an arm runs a given call site on: the pinned one, else the arm default. */
export function armModelFor(arm: LlmExperimentArm, purpose: LlmCallPurpose): string {
  return arm.models?.[purpose] ?? arm.model;
}

/** Every distinct model an arm can call (default + pins), for availability checks. */
export function armModels(arm: LlmExperimentArm): string[] {
  return [...new Set([arm.model, ...LLM_CALL_PURPOSES.map((p) => armModelFor(arm, p))])];
}
