import { z } from 'zod';
import { ClientSourcesSchema } from '../shared/clientSources.js';

/**
 * The doc collector's per-instance config, stored in agent_instances.settings
 * (JSONB): client-import sources (monday boards / Google Sheets mapped by
 * their email column). Each imported client's checklist comes from the
 * source's mapped documents column; without one an imported client would
 * complete trivially, so the scan refuses to enroll until it is mapped.
 */
export const DocCollectorSettingsSchema = ClientSourcesSchema.extend({
  // Legacy default-documents checklist. No longer editable or applied (the
  // documents column is the only supply), kept so stored settings that still
  // carry it survive this strict schema.
  documents: z
    .array(
      z
        .object({
          name: z.string().min(1).max(200),
          description: z.string().max(2000).nullable().optional(),
        })
        .strict(),
    )
    .max(50)
    .default([]),
}).strict();

export type DocCollectorSettings = z.infer<typeof DocCollectorSettingsSchema>;

/** Tolerant read of the stored JSONB: unknown/invalid shapes fall back to empty config. */
export function parseSettings(raw: Record<string, unknown>): DocCollectorSettings {
  const parsed = DocCollectorSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : { boards: [], sheets: [], documents: [] };
}
