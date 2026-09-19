import { pool } from '../pool.js';
import { normalizeE164 } from '../../util/phone.js';
import { syntheticWaEmail } from '../../util/syntheticEmail.js';
import type { ClientRow, GoalStatus } from '../types.js';

/** Matches a pg unique_violation on one specific constraint/index. */
function isUniqueViolationOn(err: unknown, constraint: string): boolean {
  return (
    err instanceof Error &&
    'code' in err &&
    (err as { code?: string }).code === '23505' &&
    (err as { constraint?: string }).constraint === constraint
  );
}

export async function getById(id: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE id = $1', [id]);
  return rows[0] ?? null;
}

/** getById constrained to one user's roster — API routes use this so users can't reach others' clients. */
export async function getByIdForUser(id: string, userId: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE id = $1 AND user_id = $2', [id, userId]);
  return rows[0] ?? null;
}

export async function listForUser(userId: string): Promise<ClientRow[]> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE user_id = $1 ORDER BY created_at DESC', [
    userId,
  ]);
  return rows;
}

/** Case-insensitive: addresses are stored lowercased, but callers may pass any casing. */
export async function getByEmailAddressForUser(userId: string, emailAddress: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    'SELECT * FROM clients WHERE user_id = $1 AND lower(email_address) = lower($2)',
    [userId, emailAddress],
  );
  return rows[0] ?? null;
}

export async function insert(args: {
  userId: string;
  agentInstanceId: string;
  name: string;
  emailAddress: string;
  phone?: string | null;
  /** Per-agent scalar fields (agent_fields JSONB), e.g. due_date. */
  agentFields?: Record<string, unknown>;
  /** Created paused (manual-kickoff agents): the agent stays quiet until an explicit accountant trigger. */
  paused?: boolean;
}): Promise<ClientRow> {
  const insertRow = async (waPhone: string | null): Promise<ClientRow> => {
    const { rows } = await pool.query<ClientRow>(
      `INSERT INTO clients (user_id, agent_instance_id, name, email_address, phone, goal_status, agent_fields, paused,
                            wa_phone, wa_enabled, wa_opted_in_at, wa_opted_in_by)
       VALUES ($1, $2, $3, $4, $5, 'pending', COALESCE($6::jsonb, '{}'::jsonb), $8,
               $7::text, $7 IS NOT NULL, CASE WHEN $7 IS NOT NULL THEN now() END, CASE WHEN $7 IS NOT NULL THEN $1::uuid END)
       RETURNING *`,
      // Stored lowercased — inbound routing and the import dedupe match on it.
      [
        args.userId,
        args.agentInstanceId,
        args.name,
        args.emailAddress.trim().toLowerCase(),
        args.phone ?? null,
        args.agentFields ? JSON.stringify(args.agentFields) : null,
        waPhone,
        args.paused ?? false,
      ],
    );
    const row = rows[0];
    if (!row) throw new Error('insert client: no row returned');
    return row;
  };

  // WhatsApp is on by default: a client created with a usable phone number is
  // immediately reachable on both channels, no per-client opt-in step.
  const waPhone = args.phone ? normalizeE164(args.phone) : null;
  try {
    return await insertRow(waPhone);
  } catch (err) {
    // Another of the instance's clients already uses this number — enroll the
    // client anyway, just without the WhatsApp channel.
    if (waPhone && isUniqueViolationOn(err, 'clients_instance_wa_phone_key')) return insertRow(null);
    throw err;
  }
}

/** getById constrained to one agent instance — agent-scoped API routes use this. */
export async function getByIdForInstance(id: string, agentInstanceId: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE id = $1 AND agent_instance_id = $2', [
    id,
    agentInstanceId,
  ]);
  return rows[0] ?? null;
}

export async function listForInstance(agentInstanceId: string): Promise<ClientRow[]> {
  const { rows } = await pool.query<ClientRow>(
    'SELECT * FROM clients WHERE agent_instance_id = $1 ORDER BY created_at DESC',
    [agentInstanceId],
  );
  return rows;
}

/** Case-insensitive: addresses are stored lowercased, but callers may pass any casing. */
export async function getByEmailAddressForInstance(
  agentInstanceId: string,
  emailAddress: string,
): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    'SELECT * FROM clients WHERE agent_instance_id = $1 AND lower(email_address) = lower($2)',
    [agentInstanceId, emailAddress],
  );
  return rows[0] ?? null;
}

/** Inbound WhatsApp routing: the instance's client with this (E.164) number. */
export async function getByWaPhoneForInstance(agentInstanceId: string, waPhone: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('SELECT * FROM clients WHERE agent_instance_id = $1 AND wa_phone = $2', [
    agentInstanceId,
    waPhone,
  ]);
  return rows[0] ?? null;
}

/** updateDetailsForUser constrained to one agent instance — agent-scoped API routes use this. */
export async function updateDetailsForInstance(
  id: string,
  agentInstanceId: string,
  patch: ClientDetailsPatch,
): Promise<ClientRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [id, agentInstanceId];
  for (const field of ['name', 'occupation', 'phone', 'company', 'notes'] as const) {
    if (patch[field] !== undefined) {
      values.push(patch[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  if (sets.length === 0) return getByIdForInstance(id, agentInstanceId);
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND agent_instance_id = $2 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

/** Deletes the instance's client; documents, files, emails and the scheduled-job row cascade. */
export async function removeForInstance(id: string, agentInstanceId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM clients WHERE id = $1 AND agent_instance_id = $2', [
    id,
    agentInstanceId,
  ]);
  return (rowCount ?? 0) > 0;
}

export interface ClientDetailsPatch {
  name?: string;
  occupation?: string | null;
  phone?: string | null;
  company?: string | null;
  notes?: string | null;
}

/** Updates only the provided profile fields; returns the updated row (null if the client isn't the user's). */
export async function updateDetailsForUser(
  id: string,
  userId: string,
  patch: ClientDetailsPatch,
): Promise<ClientRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [id, userId];
  for (const field of ['name', 'occupation', 'phone', 'company', 'notes'] as const) {
    if (patch[field] !== undefined) {
      values.push(patch[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  if (sets.length === 0) return getByIdForUser(id, userId);
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND user_id = $2 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

/**
 * Enables the WhatsApp channel: stores the validated E.164 number and records
 * who opted the client in and when (clearing any earlier opt-out).
 */
export async function enableWhatsApp(id: string, args: { waPhone: string; optedInBy: string }): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients
     SET wa_phone = $2, wa_enabled = true, wa_opted_in_at = now(), wa_opted_in_by = $3,
         wa_opted_out_at = NULL, updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id, args.waPhone, args.optedInBy],
  );
  return rows[0] ?? null;
}

/**
 * Default-on WhatsApp for an existing client that gained a phone number (client
 * details edit, source-column backfill): enables the channel unless the client
 * already has a number stored or ever opted out — an explicit opt-out is never
 * silently reversed. A collision with another client's number is swallowed
 * (returns null; the channel just stays off).
 */
export async function autoEnableWhatsApp(id: string, waPhone: string): Promise<ClientRow | null> {
  try {
    const { rows } = await pool.query<ClientRow>(
      `UPDATE clients
       SET wa_phone = $2, wa_enabled = true, wa_opted_in_at = now(), updated_at = now()
       WHERE id = $1 AND wa_phone IS NULL AND wa_opted_out_at IS NULL
       RETURNING *`,
      [id, waPhone],
    );
    return rows[0] ?? null;
  } catch (err) {
    if (isUniqueViolationOn(err, 'clients_instance_wa_phone_key')) return null;
    throw err;
  }
}

/** Disables the WhatsApp channel (accountant toggle or client opt-out); the number is kept. */
export async function disableWhatsApp(id: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients
     SET wa_enabled = false, wa_opted_out_at = now(), updated_at = now()
     WHERE id = $1 RETURNING *`,
    [id],
  );
  return rows[0] ?? null;
}

/** Flips the outreach pause switch; returns the updated row (null if the client is gone). */
export async function setPaused(id: string, paused: boolean): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    'UPDATE clients SET paused = $2, updated_at = now() WHERE id = $1 RETURNING *',
    [id, paused],
  );
  return rows[0] ?? null;
}

/** Admin-owned emergency brake (048), separate from the accountant-visible `paused`. updated_at is left alone — the accountant didn't edit anything. */
export async function setAdminPaused(id: string, on: boolean): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>('UPDATE clients SET admin_paused = $2 WHERE id = $1 RETURNING *', [
    id,
    on,
  ]);
  return rows[0] ?? null;
}

/**
 * Stamps the start of a planning attempt (and clears any earlier failure).
 * Agent-status fields only, so updated_at is left alone — it tracks accountant edits.
 */
export async function markDraftingStarted(id: string): Promise<void> {
  await pool.query('UPDATE clients SET drafting_since = now(), draft_failed_at = NULL WHERE id = $1', [id]);
}

/** Records that the planning attempt threw; the UI offers a manual retry. */
export async function markDraftingFailed(id: string): Promise<void> {
  await pool.query('UPDATE clients SET drafting_since = NULL, draft_failed_at = now() WHERE id = $1', [id]);
}

/** Clears the drafting stamp after a successful planning attempt. */
export async function clearDraftingState(id: string): Promise<void> {
  await pool.query('UPDATE clients SET drafting_since = NULL, draft_failed_at = NULL WHERE id = $1', [id]);
}

/**
 * Clients whose planning attempt started within the last `withinSeconds` and
 * that have nothing scheduled — on worker boot these are turns whose deferred
 * re-plan may have been lost with Redis (see recoverLostReplans).
 */
export async function listDraftingWithoutSchedule(withinSeconds: number): Promise<string[]> {
  const { rows } = await pool.query<{ id: string }>(
    `SELECT c.id FROM clients c
     WHERE c.drafting_since > now() - make_interval(secs => $1)
       AND c.goal_status = 'pending' AND NOT c.paused
       AND NOT EXISTS (SELECT 1 FROM scheduled_jobs s WHERE s.client_id = c.id)`,
    [withinSeconds],
  );
  return rows.map((r) => r.id);
}

/** Deletes the client; documents, files, emails and the scheduled-job row go with it via FK cascades. */
export async function removeForUser(id: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM clients WHERE id = $1 AND user_id = $2', [id, userId]);
  return (rowCount ?? 0) > 0;
}

export async function updateGoalStatus(id: string, goalStatus: GoalStatus): Promise<void> {
  await pool.query('UPDATE clients SET goal_status = $2, updated_at = now() WHERE id = $1', [id, goalStatus]);
}

/**
 * Clients of the given agent types whose collection due date has passed and
 * whose accountant has not been notified yet. `todayLocal` is "YYYY-MM-DD" in
 * the accountant's timezone — the string compare works because due_date shares
 * the format (enforced by the regex). Manually paused clients are skipped (the
 * agent wasn't chasing them anyway), as are ownerless legacy CLI rows.
 */
export async function listOverdueForAgentTypes(todayLocal: string, agentTypes: string[]): Promise<ClientRow[]> {
  const { rows } = await pool.query<ClientRow>(
    `SELECT c.* FROM clients c
     JOIN agent_instances ai ON ai.id = c.agent_instance_id
     WHERE ai.agent_type = ANY($2::text[])
       AND c.goal_status = 'pending' AND c.paused = false AND c.user_id IS NOT NULL
       AND (c.agent_fields->>'due_date') ~ '^\\d{4}-\\d{2}-\\d{2}$'
       AND (c.agent_fields->>'due_date') < $1
       AND (c.agent_fields->>'overdue_notified_at') IS NULL`,
    [todayLocal, agentTypes],
  );
  return rows;
}

/**
 * Atomically claims an overdue client: pauses it and stamps both overdue
 * markers. The WHERE conditions make concurrent scans (boot + cron) race-safe —
 * only one run gets the row back; null means another run already handled it or
 * the client's state changed since it was listed.
 */
export async function markOverdueStopped(id: string): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients
     SET paused = true,
         agent_fields = agent_fields || jsonb_build_object('overdue_notified_at', $2::text, 'overdue_stopped_at', $2::text),
         updated_at = now()
     WHERE id = $1 AND goal_status = 'pending' AND paused = false
       AND (agent_fields->>'overdue_notified_at') IS NULL
     RETURNING *`,
    [id, new Date().toISOString()],
  );
  return rows[0] ?? null;
}

/**
 * Sets or clears the client's collection due date. Either way both
 * overdue markers are dropped, so a changed date can notify again when the new
 * date passes and any "handed off" UI state is cleared.
 */
export async function setDueDate(
  id: string,
  agentInstanceId: string,
  dueDate: string | null,
): Promise<ClientRow | null> {
  const { rows } = await pool.query<ClientRow>(
    `UPDATE clients
     SET agent_fields = CASE WHEN $3::text IS NULL
           THEN agent_fields - 'due_date' - 'overdue_notified_at' - 'overdue_stopped_at'
           ELSE (agent_fields - 'overdue_notified_at' - 'overdue_stopped_at') || jsonb_build_object('due_date', $3::text) END,
         updated_at = now()
     WHERE id = $1 AND agent_instance_id = $2
     RETURNING *`,
    [id, agentInstanceId, dueDate],
  );
  return rows[0] ?? null;
}

/**
 * Clears the "stopped because overdue" UI marker on resume. The
 * overdue_notified_at idempotency key stays, so the accountant is not emailed
 * again for the same due date.
 */
export async function clearOverdueStopped(id: string): Promise<void> {
  await pool.query(`UPDATE clients SET agent_fields = agent_fields - 'overdue_stopped_at' WHERE id = $1`, [id]);
}

/**
 * Stamps which scheduled draft is the attestation summary (declaration of
 * capital). Overwritten when a newer request is scheduled; the confirmation
 * validator only trusts it once that email row is actually 'sent'.
 */
export async function setAttestationRequest(id: string, emailId: string): Promise<void> {
  await pool.query(
    `UPDATE clients SET agent_fields = agent_fields || jsonb_build_object('attestation_request_email_id', $2::text) WHERE id = $1`,
    [id, emailId],
  );
}

/** Records the client's completeness confirmation (declaration of capital) with the message quote it rests on. */
export async function setAttestationConfirmed(
  id: string,
  evidence: { message_id: string; quote: string },
): Promise<void> {
  await pool.query(
    `UPDATE clients SET agent_fields = agent_fields
       || jsonb_build_object('attestation_confirmed_at', $2::text, 'attestation_evidence', $3::jsonb)
     WHERE id = $1`,
    [id, new Date().toISOString(), JSON.stringify(evidence)],
  );
}

/**
 * Resets the attestation (declaration of capital) — called whenever the
 * checklist reopens after the summary was requested/confirmed (a client
 * correction, an accountant override), so a stale confirmation can never
 * complete the goal over a changed document list.
 */
export async function clearAttestation(id: string): Promise<void> {
  await pool.query(
    `UPDATE clients SET agent_fields = agent_fields - 'attestation_request_email_id' - 'attestation_confirmed_at' - 'attestation_evidence' WHERE id = $1`,
    [id],
  );
}

/**
 * Remembers which monday board row the client came from (agent_fields JSONB) —
 * the write-back address of the board status sync. Agent bookkeeping, so
 * updated_at is left alone — it tracks accountant edits.
 */
export async function setMondayItem(id: string, boardId: string, itemId: string): Promise<void> {
  await pool.query(
    `UPDATE clients SET agent_fields = agent_fields || jsonb_build_object('monday_board_id', $2::text, 'monday_item_id', $3::text) WHERE id = $1`,
    [id, boardId, itemId],
  );
}

/**
 * Stamps the declaration-of-capital engagement identity read from the monday
 * board row at kickoff: the tax-office file number, the declaration year the
 * checklist targets, and the linked CRM / questionnaire item ids. Merged into
 * agent_fields (agent bookkeeping — updated_at is left alone).
 */
export async function setDeclarationEngagement(
  id: string,
  fields: {
    taxYear?: number;
    fileNumber?: string;
    idNumber?: string;
    crmItemId?: string;
    formItemId?: string;
    formAnswers?: Array<{ question: string; answer: string }>;
  },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (fields.taxYear !== undefined) patch['tax_year'] = fields.taxYear;
  if (fields.fileNumber !== undefined) patch['file_number'] = fields.fileNumber;
  if (fields.idNumber !== undefined) patch['id_number'] = fields.idNumber;
  if (fields.crmItemId !== undefined) patch['monday_crm_item_id'] = fields.crmItemId;
  if (fields.formItemId !== undefined) patch['monday_form_item_id'] = fields.formItemId;
  if (fields.formAnswers !== undefined) patch['form_answers'] = fields.formAnswers;
  if (Object.keys(patch).length === 0) return;
  await pool.query(`UPDATE clients SET agent_fields = agent_fields || $2::jsonb WHERE id = $1`, [
    id,
    JSON.stringify(patch),
  ]);
}

export async function updateName(id: string, name: string): Promise<void> {
  await pool.query('UPDATE clients SET name = $2, updated_at = now() WHERE id = $1', [id, name]);
}
