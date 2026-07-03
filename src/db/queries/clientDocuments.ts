import { pool } from '../pool.js';
import type { ClientDocumentRow, DocumentStatus } from '../types.js';

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
}): Promise<ClientDocumentRow> {
  const { rows } = await pool.query<ClientDocumentRow>(
    `INSERT INTO client_documents (client_id, name, description) VALUES ($1, $2, $3) RETURNING *`,
    [args.clientId, args.name, args.description ?? null],
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
  await pool.query(
    `UPDATE client_documents SET status = 'collected', updated_at = now() WHERE client_id = $1 AND id = ANY($2::uuid[])`,
    [clientId, ids],
  );
}
