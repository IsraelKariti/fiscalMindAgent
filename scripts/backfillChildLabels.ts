/**
 * One-time (idempotent, safe to re-run) fill after split child files started
 * getting a name from their document type and company (openspec
 * `file-splitting`): names the children that were analysed before that and
 * match no list document. New children are named by analyzeInboundFile.ts.
 *
 * Only rows with no label, a finished analysis and no linked document are
 * touched; the name is built by the same rule (splitChildNames.ts childLabel)
 * from the stored analysis.
 */
import { Pool } from 'pg';
import { env } from '../src/config/env.js';
import { classificationQuarantined, type FileAnalysis } from '../src/agents/declarationOfCapital/analyzeFileRules.js';
import { childLabel } from '../src/agents/declarationOfCapital/splitChildNames.js';
import { logger } from '../src/util/logger.js';

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const { rows } = await pool.query<{ id: string; analysis: FileAnalysis | null }>(
    `SELECT id, analysis FROM document_files
      WHERE parent_file_id IS NOT NULL AND label IS NULL
        AND analysis_status = 'done' AND client_document_id IS NULL`,
  );
  let named = 0;
  for (const row of rows) {
    if (!row.analysis) continue;
    const label = childLabel({
      documentType: row.analysis.document_type,
      issuerName: row.analysis.issuer_name,
      quarantined: classificationQuarantined(row.analysis),
    });
    if (label === null) continue;
    await pool.query('UPDATE document_files SET label = $2 WHERE id = $1 AND label IS NULL', [row.id, label]);
    named++;
  }
  logger.info(`split child files: named ${named} of ${rows.length} unnamed rows (rest have no known type or are quarantined)`);
  await pool.end();
}

main().catch((err) => {
  logger.error('backfillChildLabels failed', err);
  process.exit(1);
});
