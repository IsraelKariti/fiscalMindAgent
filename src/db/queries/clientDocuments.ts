import { pool } from '../pool.js';
import type { ClientDocumentRow, DocumentStatus, ResolutionEvidence } from '../types.js';

export async function getForClient(id: string, clientId: string): Promise<ClientDocumentRow | null> {
  const { rows } = await pool.query<ClientDocumentRow>(
    'SELECT * FROM client_documents WHERE id = $1 AND client_id = $2',
    [id, clientId],
  );
  return rows[0] ?? null;
}

export async function listForClient(clientId: string): Promise<ClientDocumentRow[]> {
  const { rows } = await pool.query<ClientDocumentRow>(
    'SELECT * FROM client_documents WHERE client_id = $1 ORDER BY created_at, id',
    [clientId],
  );
  return rows;
}

export async function insert(args: {
  clientId: string;
  name: string;
  description?: string | null;
  /** Catalog type the row instantiates (declaration of capital); omit for doc-collector/ad-hoc rows. */
  typeKey?: string | null;
  /** Seeding status; defaults to 'pending' (catalog seeding passes 'unresolved'). */
  status?: DocumentStatus;
}): Promise<ClientDocumentRow> {
  const { rows } = await pool.query<ClientDocumentRow>(
    `INSERT INTO client_documents (client_id, name, description, type_key, status) VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [args.clientId, args.name, args.description ?? null, args.typeKey ?? null, args.status ?? 'pending'],
  );
  const row = rows[0];
  if (!row) throw new Error('insert client document: no row returned');
  return row;
}

export interface DocumentPatch {
  name?: string;
  description?: string | null;
  status?: DocumentStatus;
}

/** Updates only the provided fields; returns the updated row (null if the document isn't the client's). */
export async function updateForClient(
  id: string,
  clientId: string,
  patch: DocumentPatch,
): Promise<ClientDocumentRow | null> {
  const sets: string[] = [];
  const values: unknown[] = [id, clientId];
  for (const field of ['name', 'description', 'status'] as const) {
    if (patch[field] !== undefined) {
      values.push(patch[field]);
      sets.push(`${field} = $${values.length}`);
    }
  }
  if (sets.length === 0) {
    const { rows } = await pool.query<ClientDocumentRow>(
      'SELECT * FROM client_documents WHERE id = $1 AND client_id = $2',
      [id, clientId],
    );
    return rows[0] ?? null;
  }
  const { rows } = await pool.query<ClientDocumentRow>(
    `UPDATE client_documents SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 AND client_id = $2 RETURNING *`,
    values,
  );
  return rows[0] ?? null;
}

export async function removeForClient(id: string, clientId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM client_documents WHERE id = $1 AND client_id = $2', [
    id,
    clientId,
  ]);
  return (rowCount ?? 0) > 0;
}

export async function markCollected(clientId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  // Status-guarded: an unresolved/not_required row (capital-declaration intake)
  // must first be resolved to pending, and 'approved' is never downgraded.
  await pool.query(
    `UPDATE client_documents SET status = 'collected', updated_at = now()
     WHERE client_id = $1 AND id = ANY($2::uuid[]) AND status IN ('pending', 'claimed')`,
    [clientId, ids],
  );
}

/** Records a client's no-file delivery claim; only pending rows move (never downgrades collected). */
export async function markClaimed(clientId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await pool.query(
    `UPDATE client_documents SET status = 'claimed', updated_at = now()
     WHERE client_id = $1 AND id = ANY($2::uuid[]) AND status = 'pending'`,
    [clientId, ids],
  );
}

/**
 * Intake resolution (capital declaration): the client stated the asset doesn't
 * apply. Only an 'unresolved' row moves, and never without the client
 * statement it rests on. Returns null when the row isn't the client's
 * unresolved row.
 */
export async function resolveNotRequired(
  id: string,
  clientId: string,
  evidence: ResolutionEvidence,
): Promise<ClientDocumentRow | null> {
  const { rows } = await pool.query<ClientDocumentRow>(
    `UPDATE client_documents SET status = 'not_required', resolution_evidence = $3, updated_at = now()
     WHERE id = $1 AND client_id = $2 AND status = 'unresolved' RETURNING *`,
    [id, clientId, JSON.stringify(evidence)],
  );
  return rows[0] ?? null;
}

/**
 * Intake resolution (capital declaration): one 'unresolved' catalog row becomes
 * 1..N concrete pending documents — the first instance renames the row itself,
 * extras insert sibling rows sharing its type_key — atomically, so a crash
 * can't leave half the client's cars on the checklist. A 'not_required' row is
 * also a valid target (the client corrected themselves — "actually I do have a
 * car"); its old evidence is cleared. Returns all resulting rows, or null when
 * the target isn't the client's resolvable row.
 */
export async function resolveRequired(
  id: string,
  clientId: string,
  instances: { name: string; description: string | null }[],
): Promise<ClientDocumentRow[] | null> {
  if (instances.length === 0) throw new Error('resolveRequired: at least one instance is required');
  const conn = await pool.connect();
  try {
    await conn.query('BEGIN');
    const first = instances[0]!;
    const { rows: updated } = await conn.query<ClientDocumentRow>(
      `UPDATE client_documents
       SET status = 'pending', name = $3, description = $4, resolution_evidence = NULL, updated_at = now()
       WHERE id = $1 AND client_id = $2 AND status IN ('unresolved', 'not_required') RETURNING *`,
      [id, clientId, first.name, first.description],
    );
    const head = updated[0];
    if (!head) {
      await conn.query('ROLLBACK');
      return null;
    }
    const result = [head];
    for (const instance of instances.slice(1)) {
      const { rows } = await conn.query<ClientDocumentRow>(
        `INSERT INTO client_documents (client_id, name, description, type_key, status)
         VALUES ($1, $2, $3, $4, 'pending') RETURNING *`,
        [clientId, instance.name, instance.description, head.type_key],
      );
      if (rows[0]) result.push(rows[0]);
    }
    await conn.query('COMMIT');
    return result;
  } catch (err) {
    await conn.query('ROLLBACK').catch(() => undefined);
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Stores a verification verdict without changing status — the stalled
 * (3-strikes) and unverifiable outcomes, where the row stays 'collected' and
 * the accountant takes over.
 */
export async function setVerification(
  id: string,
  clientId: string,
  verification: Record<string, unknown>,
): Promise<ClientDocumentRow | null> {
  const { rows } = await pool.query<ClientDocumentRow>(
    `UPDATE client_documents SET verification = $3, updated_at = now()
     WHERE id = $1 AND client_id = $2 RETURNING *`,
    [id, clientId, JSON.stringify(verification)],
  );
  return rows[0] ?? null;
}

/**
 * Verification pass (capital declaration): only the verification pipeline
 * calls this — a collected row becomes approved with the verdict that earned
 * it. Never valid from any other status.
 */
export async function markApproved(
  id: string,
  clientId: string,
  verification: Record<string, unknown>,
): Promise<ClientDocumentRow | null> {
  const { rows } = await pool.query<ClientDocumentRow>(
    `UPDATE client_documents SET status = 'approved', verification = $3, updated_at = now()
     WHERE id = $1 AND client_id = $2 AND status = 'collected' RETURNING *`,
    [id, clientId, JSON.stringify(verification)],
  );
  return rows[0] ?? null;
}

/**
 * Verification failure (capital declaration): the received file didn't pass
 * the code checks — the row reopens as pending, carrying the failure verdict
 * so the agent can tell the client exactly what to fix.
 */
export async function revertToPending(
  id: string,
  clientId: string,
  verification: Record<string, unknown>,
): Promise<ClientDocumentRow | null> {
  const { rows } = await pool.query<ClientDocumentRow>(
    `UPDATE client_documents SET status = 'pending', verification = $3, updated_at = now()
     WHERE id = $1 AND client_id = $2 AND status = 'collected' RETURNING *`,
    [id, clientId, JSON.stringify(verification)],
  );
  return rows[0] ?? null;
}
