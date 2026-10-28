import type { RequestHandler } from 'express';
import { z } from 'zod';
import * as accountantStaff from '../db/queries/accountantStaff.js';
import * as users from '../db/queries/users.js';
import * as whitelist from '../db/queries/whitelist.js';
import { recordAudit } from '../audit/audit.js';
import { logger } from '../util/logger.js';

/**
 * The accountant's staff list (openspec `accountant-employee-access`): the
 * email addresses of employees who may sign in and view the workspace
 * read-only. Account-level, keyed on req.userId — the accountant, also while
 * an admin views as them. A staff viewer never reaches these routes
 * (viewerReadOnlyGate refuses everything outside GET /agents*).
 */

const StaffAddSchema = z.object({ email: z.string().email() }).strict();

/** Refusal reasons, mapped to wording by the SPA (i18n). */
export type StaffAddRefusal = 'own_email' | 'admin_email' | 'accountant_email' | 'other_accountants_staff' | 'duplicate';

function serialize(row: accountantStaff.StaffListRow) {
  return { id: row.id, email: row.email, signedIn: row.signed_in, createdAt: row.created_at };
}

/** GET /api/staff — the accountant's staff list, oldest first. */
export const listStaff: RequestHandler = async (req, res) => {
  const rows = await accountantStaff.listForAccountant(req.userId!);
  res.json({ staff: rows.map(serialize) });
};

/** POST /api/staff { email } — add an employee's address. */
export const addStaff: RequestHandler = async (req, res) => {
  const parsed = StaffAddSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Enter a valid email address.', code: 'invalid_email' });
    return;
  }
  const email = parsed.data.email.toLowerCase();
  const accountantId = req.userId!;
  const refuse = (code: StaffAddRefusal, error: string): void => {
    res.status(409).json({ error, code });
  };

  const accountant = await users.getById(accountantId);
  if (accountant && accountant.email.toLowerCase() === email) {
    refuse('own_email', "This is the account's own address.");
    return;
  }
  if (await users.isAdminEmailInDb(email)) {
    refuse('admin_email', 'This address is an administrator account.');
    return;
  }
  if (await whitelist.isWhitelisted(email)) {
    refuse('accountant_email', 'This address is an accountant account.');
    return;
  }
  const existing = await accountantStaff.findByEmail(email);
  if (existing) {
    if (existing.accountant_user_id === accountantId) refuse('duplicate', 'This address is already on the list.');
    else refuse('other_accountants_staff', "This address already belongs to another account's staff.");
    return;
  }
  const row = await accountantStaff.add(accountantId, email, req.realUserId ?? accountantId);
  if (!row) {
    // Lost a race with a concurrent add; report it like any existing row.
    const owner = await accountantStaff.findByEmail(email);
    if (owner?.accountant_user_id === accountantId) refuse('duplicate', 'This address is already on the list.');
    else refuse('other_accountants_staff', "This address already belongs to another account's staff.");
    return;
  }
  recordStaffAudit(req, 'staff.added', accountantId, email);
  logger.info('staff added', { accountantId, email, actorUserId: req.realUserId });
  const signedIn = await users.hasSignedIn(email);
  res.status(201).json({ entry: serialize({ ...row, signed_in: signedIn }) });
};

/** DELETE /api/staff/:id — remove an employee's address; their next request is refused. */
export const removeStaff: RequestHandler = async (req, res) => {
  const id = z.string().uuid().safeParse(req.params.id);
  const row = id.success ? await accountantStaff.removeForAccountant(id.data, req.userId!) : null;
  if (!row) {
    res.status(404).json({ error: 'Staff entry not found.' });
    return;
  }
  recordStaffAudit(req, 'staff.removed', req.userId!, row.email);
  logger.info('staff removed', { accountantId: req.userId, email: row.email, actorUserId: req.realUserId });
  res.json({ ok: true });
};

function recordStaffAudit(
  req: Parameters<RequestHandler>[0],
  action: 'staff.added' | 'staff.removed',
  accountantId: string,
  email: string,
): void {
  const viewingAs = req.realUserId !== undefined && req.realUserId !== accountantId;
  recordAudit({
    actorType: viewingAs ? 'admin' : 'accountant',
    action,
    actorUserId: req.realUserId ?? accountantId,
    targetType: 'user',
    targetId: accountantId,
    detail: { email },
  });
}
