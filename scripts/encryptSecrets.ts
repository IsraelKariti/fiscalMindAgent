/**
 * One-time (idempotent, safe to re-run) backfill after the secretBox layer
 * landed: encrypts every plaintext secret already stored in Postgres and
 * redacts tax-portal OTPs from historical WhatsApp message bodies. New writes
 * are encrypted by the query modules; this script only migrates old rows.
 *
 * Run locally with the dev stack's .env, and in production the same way
 * migrations run there (a one-off exec of dist/scripts/encryptSecrets.js).
 */
import { Pool } from 'pg';
import { env } from '../src/config/env.js';
import { encryptSecret, isEncrypted } from '../src/crypto/secretBox.js';
import { logger } from '../src/util/logger.js';

async function encryptTable(
  pool: Pool,
  table: string,
  idColumn: string,
  secretColumns: string[],
): Promise<void> {
  const { rows } = await pool.query<Record<string, string>>(
    `SELECT ${idColumn}, ${secretColumns.join(', ')} FROM ${table}`,
  );
  let updated = 0;
  for (const row of rows) {
    const pending = secretColumns.filter((c) => row[c] != null && !isEncrypted(row[c]!));
    if (pending.length === 0) continue;
    const sets = pending.map((c, i) => `${c} = $${i + 2}`).join(', ');
    await pool.query(`UPDATE ${table} SET ${sets} WHERE ${idColumn} = $1`, [
      row[idColumn],
      ...pending.map((c) => encryptSecret(row[c]!)),
    ]);
    updated++;
  }
  logger.info(`${table}: encrypted ${updated} of ${rows.length} rows (rest already encrypted)`);
}

/** Same shape inboundOtp.ts matches live — a 4–8 digit run, spaces/hyphens allowed. */
const OTP_PATTERN = /\b(\d[\d\s-]{2,}\d)\b/;

/**
 * Historical OTPs: inbound WhatsApp replies sent within 30 minutes of a
 * tax-fetch session requesting an OTP. The window keeps the sweep from
 * touching unrelated digit-bearing messages (amounts, phone numbers).
 */
async function redactHistoricalOtps(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ id: string; body: string }>(
    `SELECT DISTINCT e.id, e.body FROM emails e
     JOIN tax_fetch_sessions s ON s.client_id = e.client_id
     WHERE e.direction = 'inbound' AND e.channel = 'whatsapp'
       AND s.otp_requested_at IS NOT NULL
       AND COALESCE(e.sent_at, e.created_at)
           BETWEEN s.otp_requested_at AND s.otp_requested_at + interval '30 minutes'`,
  );
  let redacted = 0;
  for (const row of rows) {
    const match = OTP_PATTERN.exec(row.body);
    if (!match?.[1]) continue;
    const digits = match[1].replace(/[\s-]/g, '');
    if (digits.length < 4 || digits.length > 8) continue;
    await pool.query('UPDATE emails SET body = $2 WHERE id = $1', [row.id, row.body.replace(OTP_PATTERN, '••••••')]);
    redacted++;
  }
  logger.info(`emails: redacted OTPs in ${redacted} of ${rows.length} candidate messages`);
}

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  await encryptTable(pool, 'client_portal_credentials', 'id', ['id_number', 'user_code']);
  await encryptTable(pool, 'google_oauth_tokens', 'user_id', ['access_token', 'refresh_token']);
  await encryptTable(pool, 'monday_oauth_tokens', 'user_id', ['access_token']);
  await redactHistoricalOtps(pool);
  await pool.end();
  logger.info('secret backfill complete');
}

main().catch((err) => {
  logger.error('secret backfill failed', err);
  process.exit(1);
});
