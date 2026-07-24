import type { Router, RequestHandler } from 'express';
import { z, type ZodTypeAny } from 'zod';
import { requireGoogleToken, requireMondayToken } from '../../api/integrationGuards.js';
import * as agentInstances from '../../db/queries/agentInstances.js';
import * as googleOauthTokens from '../../db/queries/googleOauthTokens.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { getSpreadsheetMeta } from '../customerService/googleData.js';
import { EMAIL_CAPABLE, listBoards } from '../customerService/mondayData.js';
import { scanClientImportInstance } from './clientImportScan.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

/** "Import now" body: no source = scan everything, else just the one board/sheet. */
const ScanRequestSchema = z
  .object({
    source: z
      .union([
        z.object({ boardId: z.string().min(1) }).strict(),
        z.object({ spreadsheetId: z.string().min(1), sheetTitle: z.string().min(1) }).strict(),
      ])
      .optional(),
  })
  .strict();

/**
 * The client-import source routes shared by the doc collector and the
 * annual-report assistant, registered into each agent's (already
 * agent-type-guarded) router under /client-sources. The settings schema is the
 * agent's own — the doc collector's adds the default-documents checklist.
 */
export function registerClientSourceRoutes(
  router: Router,
  opts: {
    schema: ZodTypeAny;
    parse: (raw: Record<string, unknown>) => unknown;
  },
): void {
  router.get(
    '/client-sources/settings',
    wrap(async (req, res) => {
      const [mondayToken, googleToken] = await Promise.all([
        mondayOauthTokens.getByUserId(req.userId!),
        googleOauthTokens.getByUserId(req.userId!),
      ]);
      res.json({
        settings: opts.parse(req.agentInstance!.settings),
        mondayConnected: mondayToken !== null,
        googleConnected: googleToken !== null,
      });
    }),
  );

  router.put(
    '/client-sources/settings',
    wrap(async (req, res) => {
      const parsed = opts.schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid settings.', details: parsed.error.flatten() });
        return;
      }
      const updated = await agentInstances.updateSettings(req.agentInstance!.id, parsed.data as Record<string, unknown>);
      if (!updated) {
        res.status(404).json({ error: 'Agent instance not found.' });
        return;
      }
      res.json({ settings: opts.parse(updated.settings) });
    }),
  );

  router.get(
    '/client-sources/monday/boards',
    wrap(requireMondayToken),
    wrap(async (_req, res) => {
      res.json({ boards: await listBoards(res.locals.mondayAccessToken as string, EMAIL_CAPABLE) });
    }),
  );

  /** Tabs + header columns of one picked spreadsheet — powers the email/name column mapping UI. */
  router.get(
    '/client-sources/google/spreadsheets/:spreadsheetId/meta',
    wrap(requireGoogleToken),
    wrap(async (req, res) => {
      res.json({ meta: await getSpreadsheetMeta(res.locals.googleAccessToken as string, req.params.spreadsheetId!) });
    }),
  );

  /** "Import now": the daily sweep for this one instance, on demand — optionally narrowed to one source. */
  router.post(
    '/client-sources/scan',
    wrap(async (req, res) => {
      const parsed = ScanRequestSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid scan request.', details: parsed.error.flatten() });
        return;
      }
      res.json(await scanClientImportInstance(req.agentInstance!, parsed.data.source));
    }),
  );
}
