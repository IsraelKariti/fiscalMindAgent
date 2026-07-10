import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { env } from '../config/env.js';
import * as agentMailboxes from '../db/queries/agentMailboxes.js';
import * as clientDocuments from '../db/queries/clientDocuments.js';
import * as clients from '../db/queries/clients.js';
import * as dashboard from '../db/queries/dashboard.js';
import * as mondayAccounts from '../db/queries/mondayAccounts.js';
import * as users from '../db/queries/users.js';
import * as whitelist from '../db/queries/whitelist.js';
import { isAdminEmail, requireWhitelisted } from './auth.js';
import { draftFirstEmail } from './draftFirstEmail.js';
import { createMondayHandoffToken, createMondayLinkToken, requireMondayIdentity, requireMondayUser } from './mondayAuth.js';
import { workspaceRouter } from './workspace.js';

/** Express 4 does not catch rejected async handlers; route errors through next() so they 500 instead of hanging. */
function wrap(handler: RequestHandler): RequestHandler {
  return (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
}

const SessionSchema = z
  .object({
    // Reported by the widget from monday's `me` query. Display/whitelist only —
    // it is not Google-verified, so it never auto-links to an existing user.
    email: z.string().email(),
    name: z.string().max(200).nullable().optional(),
  })
  .strict();

const ImportSchema = z
  .object({
    clients: z
      .array(
        z
          .object({
            name: z.string().min(1).max(200),
            email: z.string().email(),
            phone: z.string().max(50).nullable().optional(),
            // Required-document names read from the board's documents column.
            documents: z.array(z.string().min(1).max(200)).max(50).default([]),
          })
          .strict(),
      )
      .min(1)
      .max(500),
  })
  .strict();

/** Everything the widget needs to decide what to render for this user. */
async function sessionStatus(userId: string) {
  const user = await users.getById(userId);
  if (!user) return null;
  const [mailbox, whitelisted, tier] = await Promise.all([
    agentMailboxes.getByUserId(user.id),
    whitelist.isWhitelisted(user.email),
    whitelist.getTier(user.email),
  ]);
  return {
    provisioned: true,
    // Auto-provisioned users carry a synthetic `monday:<ids>` google_sub until
    // they link a real Google sign-in.
    linked: !user.google_sub.startsWith('monday:'),
    email: user.email,
    whitelisted: isAdminEmail(user.email) || whitelisted,
    tier,
    mailboxClaimed: mailbox !== null,
    appUrl: env.APP_BASE_URL,
  };
}

export const mondayRouter = Router();

mondayRouter.use(requireMondayIdentity);

/**
 * POST /api/monday/session — resolve (or auto-provision) the fiscalMind user
 * behind the verified monday identity and return what the widget may show.
 * When the monday-reported email already belongs to a Google-based account we
 * refuse to auto-link (the email claim is not verified) and the widget offers
 * the explicit "link existing account" popup instead.
 */
mondayRouter.post(
  '/session',
  wrap(async (req, res) => {
    const existing = await mondayAccounts.getByMondayIds(req.monday!.accountId, req.monday!.userId);
    if (existing) {
      const status = await sessionStatus(existing.user_id);
      if (status) {
        res.json(status);
        return;
      }
      // Mapped user row was deleted — fall through and provision again.
    }

    const parsed = SessionSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid session fields.', details: parsed.error.flatten() });
      return;
    }
    const { email, name } = parsed.data;

    if (await users.getByEmail(email)) {
      res.status(409).json({
        error: 'A fiscalMind account with this email already exists. Link it from the widget instead.',
        code: 'email_in_use',
      });
      return;
    }

    let user;
    try {
      user = await users.upsertFromGoogle({
        googleSub: `monday:${req.monday!.accountId}:${req.monday!.userId}`,
        email,
        name: name ?? null,
        pictureUrl: null,
      });
    } catch (err) {
      // 23505 = unique_violation on users.email: someone registered it since the check above.
      if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
        res.status(409).json({
          error: 'A fiscalMind account with this email already exists. Link it from the widget instead.',
          code: 'email_in_use',
        });
        return;
      }
      throw err;
    }
    // monday installs are self-serve: whitelist on provision at the normal tier
    // (no-op when an admin already whitelisted the email).
    await whitelist.add(email, name ?? null, 'normal');
    await mondayAccounts.upsert({
      mondayAccountId: req.monday!.accountId,
      mondayUserId: req.monday!.userId,
      userId: user.id,
      mondayEmail: email,
    });
    res.status(201).json(await sessionStatus(user.id));
  }),
);

/**
 * GET /api/monday/link-url — where the widget's "link existing account" button
 * points. Opens as a top-level popup (OAuth cannot run inside the iframe); the
 * signed short-lived token carries the monday identity through the round trip.
 */
mondayRouter.get('/link-url', (req, res) => {
  const token = createMondayLinkToken(req.monday!.accountId, req.monday!.userId);
  res.json({ url: `${env.APP_BASE_URL}/api/auth/google?monday_link=${encodeURIComponent(token)}` });
});

/**
 * GET /api/monday/app-login-url — where "Open in FiscalMind" points. The
 * signed single-use token lets the standalone app issue its regular session
 * cookie without a Google login, which monday-only accounts don't have.
 */
mondayRouter.get(
  '/app-login-url',
  wrap(requireMondayUser),
  (req, res) => {
    const token = createMondayHandoffToken(req.userId!);
    res.json({ url: `${env.APP_BASE_URL}/api/auth/monday-handoff?token=${encodeURIComponent(token)}` });
  },
);

/**
 * GET /api/monday/me — the standalone GET /api/me payload for the monday-mapped
 * user, so the custom object can boot the same workspace shell the SPA uses.
 * No impersonation here: monday sessions are always the mapped user themselves.
 */
mondayRouter.get(
  '/me',
  wrap(requireMondayUser),
  wrap(async (req, res) => {
    const user = await users.getById(req.userId!);
    if (!user) {
      res.json({ authenticated: false });
      return;
    }
    const isAdmin = isAdminEmail(user.email);
    res.json({
      authenticated: true,
      user: { id: user.id, email: user.email, name: user.name, pictureUrl: user.picture_url },
      isAdmin,
      whitelisted: isAdmin || (await whitelist.isWhitelisted(user.email)),
      tier: await whitelist.getTier(user.email),
      contactEmail: env.ADMIN_EMAILS[0] ?? null,
    });
  }),
);

// The full accountant workspace API (clients, documents, files, conversation,
// mailbox) under monday auth — same router the cookie-authenticated /api/*
// mount uses; requireMondayUser supplies the req.userId those handlers read.
mondayRouter.use('/app', wrap(requireMondayUser), wrap(requireWhitelisted), workspaceRouter);

// Slightly wider than the 8 Monday-based weeks the activity chart shows (same
// window as GET /api/dashboard).
const ACTIVITY_WINDOW_DAYS = 70;

/** GET /api/monday/dashboard — the same payload as GET /api/dashboard, monday-authenticated. */
mondayRouter.get(
  '/dashboard',
  wrap(requireMondayUser),
  wrap(requireWhitelisted),
  wrap(async (req, res) => {
    const [clientSummaries, activity, filesTotal] = await Promise.all([
      dashboard.listClientSummaries(req.userId!),
      dashboard.listEmailActivity(req.userId!, ACTIVITY_WINDOW_DAYS),
      dashboard.countFilesForUser(req.userId!),
    ]);
    res.json({ clients: clientSummaries, activity, filesTotal });
  }),
);

/**
 * POST /api/monday/clients/import — bulk-create clients read from a monday
 * board (the widget queries the board via monday's seamless API and posts the
 * mapped rows here). Existing emails are skipped, so re-importing is safe.
 */
mondayRouter.post(
  '/clients/import',
  wrap(requireMondayUser),
  wrap(requireWhitelisted),
  wrap(async (req, res) => {
    const parsed = ImportSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid import payload.', details: parsed.error.flatten() });
      return;
    }
    if (!(await agentMailboxes.getByUserId(req.userId!))) {
      res.status(409).json({
        error: "Choose your agent's email address in fiscalMind first — the agent has no mailbox to send from.",
        code: 'no_mailbox',
      });
      return;
    }

    let created = 0;
    let skipped = 0;
    for (const row of parsed.data.clients) {
      const email = row.email.trim();
      if (await clients.getByEmailAddressForUser(req.userId!, email)) {
        skipped += 1;
        continue;
      }
      const client = await clients.insert({ userId: req.userId!, name: row.name.trim(), emailAddress: email });
      if (row.phone) await clients.updateDetailsForUser(client.id, req.userId!, { phone: row.phone });
      // The documents to collect come from the board row; without any, the first
      // draft finds nothing pending and the goal completes with no outreach.
      for (const docName of new Set(row.documents.map((d) => d.trim()).filter((d) => d.length > 0))) {
        await clientDocuments.insert({ clientId: client.id, name: docName });
      }
      // Stagger the first-email drafts so a big import doesn't fire hundreds of
      // concurrent Gemini calls; each draft keeps its own retry ladder.
      const delay = created * 1500;
      created += 1;
      if (delay === 0) draftFirstEmail(client.id);
      else setTimeout(() => draftFirstEmail(client.id), delay);
    }
    res.status(201).json({ created, skipped });
  }),
);
