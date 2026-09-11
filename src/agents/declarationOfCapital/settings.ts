import { z } from 'zod';
import { ClientSourcesSchema } from '../shared/clientSources.js';

/**
 * The agent's per-instance config, stored in agent_instances.settings (JSONB):
 * client-import sources (monday boards / Google Sheets and their column
 * mappings).
 */
export const InstanceSettingsSchema = ClientSourcesSchema.extend({
  // Legacy default-documents checklist from the retired document collector.
  // Never applied (the catalog is the only checklist supply), kept so stored
  // settings that still carry it survive this strict schema.
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

export type InstanceSettings = z.infer<typeof InstanceSettingsSchema>;

/** Tolerant read of the stored JSONB: unknown/invalid shapes fall back to empty config. */
export function parseSettings(raw: Record<string, unknown>): InstanceSettings {
  const parsed = InstanceSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : { boards: [], sheets: [], documents: [] };
}
