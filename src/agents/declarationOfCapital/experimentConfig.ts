import { z } from 'zod';
import { LLM_MODEL_OPTIONS } from '../../gemini/modelCatalog.js';

/**
 * The admin LLM A/B experiment config stored in agent_instances.llm_experiment
 * (049). Pure module (no env/DB imports) so the schema's invariants are
 * testable; the runtime behavior around it lives in experiment.ts.
 */

export const LlmExperimentSchema = z
  .object({
    enabled: z.boolean(),
    arms: z
      .array(
        z
          .object({
            key: z.string().regex(/^[A-Za-z0-9_-]{1,20}$/),
            model: z.enum(LLM_MODEL_OPTIONS),
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
