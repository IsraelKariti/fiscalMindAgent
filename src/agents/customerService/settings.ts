import { z } from 'zod';

/**
 * The customer-service agent's per-instance config, stored in
 * agent_instances.settings (JSONB, shape owned by this schema): which monday
 * workdocs and Google Docs feed the general office knowledge, and which monday
 * boards / Google Sheets hold per-client rows (each with the column its phone
 * numbers live in).
 */
export const CustomerServiceSettingsSchema = z
  .object({
    docIds: z.array(z.string().min(1)).max(20).default([]),
    boards: z
      .array(
        z
          .object({
            boardId: z.string().min(1),
            phoneColumnId: z.string().min(1),
            /** Column holding the client's display name; unset = the monday item name. */
            nameColumnId: z.string().min(1).optional(),
            /** Display cache for the settings UI; the live fetch re-reads the real name. */
            boardName: z.string().optional(),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    /** Google Sheets holding per-client rows (Picker-granted via drive.file). */
    sheets: z
      .array(
        z
          .object({
            spreadsheetId: z.string().min(1),
            /** Display cache for the settings UI. */
            spreadsheetName: z.string().optional(),
            /** The tab the client rows live in. */
            sheetTitle: z.string().min(1),
            /** Header text of the column holding client phone numbers. */
            phoneColumn: z.string().min(1),
            /** Header text of the column holding the client's display name. */
            nameColumn: z.string().min(1).optional(),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    /** Google Docs feeding the general office knowledge (Picker-granted via drive.file). */
    googleDocs: z
      .array(z.object({ documentId: z.string().min(1), name: z.string().default('') }).strict())
      .max(20)
      .default([]),
  })
  .strict();

export type CustomerServiceSettings = z.infer<typeof CustomerServiceSettingsSchema>;

/** Tolerant read of the stored JSONB: unknown/invalid shapes fall back to empty config. */
export function parseSettings(raw: Record<string, unknown>): CustomerServiceSettings {
  const parsed = CustomerServiceSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : { docIds: [], boards: [], sheets: [], googleDocs: [] };
}
