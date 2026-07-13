import { z } from 'zod';

/**
 * The debt collector's per-instance config, stored in agent_instances.settings
 * (JSONB, shape owned by this schema): which monday boards / Google Sheets
 * hold the clients' financial rows, each mapped by the column their email
 * addresses live in. The optional name column only feeds the daily scan's
 * auto-enrollment (naming newly discovered debtors).
 */
export const DebtCollectorSettingsSchema = z
  .object({
    boards: z
      .array(
        z
          .object({
            boardId: z.string().min(1),
            /** Column holding the client's email address — the row-matching key. */
            emailColumnId: z.string().min(1),
            /** Column holding the client's display name; unset = the monday item name. */
            nameColumnId: z.string().min(1).optional(),
            /** Display cache for the settings UI; the live fetch re-reads the real name. */
            boardName: z.string().optional(),
          })
          .strict(),
      )
      .max(10)
      .default([]),
    /** Google Sheets holding client financial rows (Picker-granted via drive.file). */
    sheets: z
      .array(
        z
          .object({
            spreadsheetId: z.string().min(1),
            /** Display cache for the settings UI. */
            spreadsheetName: z.string().optional(),
            /** The tab the client rows live in. */
            sheetTitle: z.string().min(1),
            /** Header text of the column holding client email addresses. */
            emailColumn: z.string().min(1),
            /** Header text of the column holding the client's display name. */
            nameColumn: z.string().min(1).optional(),
          })
          .strict(),
      )
      .max(10)
      .default([]),
  })
  .strict();

export type DebtCollectorSettings = z.infer<typeof DebtCollectorSettingsSchema>;

/** Tolerant read of the stored JSONB: unknown/invalid shapes fall back to empty config. */
export function parseSettings(raw: Record<string, unknown>): DebtCollectorSettings {
  const parsed = DebtCollectorSettingsSchema.safeParse(raw);
  return parsed.success ? parsed.data : { boards: [], sheets: [] };
}
