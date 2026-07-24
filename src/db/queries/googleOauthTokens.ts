import { decryptSecret, encryptSecret } from '../../crypto/secretBox.js';
import { pool } from '../pool.js';

/**
 * Per-accountant Google OAuth tokens (drive.file — server-side Sheets/Docs
 * reads). Both tokens are encrypted at rest (secretBox); rows returned from
 * this module always carry the plaintext values.
 */
export interface GoogleOauthTokenRow {
  user_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: Date;
  scopes: string;
  created_at: Date;
  updated_at: Date;
}

export async function getByUserId(userId: string): Promise<GoogleOauthTokenRow | null> {
  const { rows } = await pool.query<GoogleOauthTokenRow>('SELECT * FROM google_oauth_tokens WHERE user_id = $1', [
    userId,
  ]);
  const row = rows[0];
  if (!row) return null;
  return { ...row, access_token: decryptSecret(row.access_token), refresh_token: decryptSecret(row.refresh_token) };
}

/** Re-connecting replaces the whole grant (Google issues a fresh refresh token on prompt=consent). */
export async function upsert(args: {
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO google_oauth_tokens (user_id, access_token, refresh_token, expires_at, scopes)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (user_id) DO UPDATE
       SET access_token = EXCLUDED.access_token, refresh_token = EXCLUDED.refresh_token,
           expires_at = EXCLUDED.expires_at, scopes = EXCLUDED.scopes, updated_at = now()`,
    [args.userId, encryptSecret(args.accessToken), encryptSecret(args.refreshToken), args.expiresAt, args.scopes],
  );
}

/** After an on-demand refresh: new access token, same refresh token. */
export async function updateAccessToken(userId: string, accessToken: string, expiresAt: Date): Promise<void> {
  await pool.query(
    'UPDATE google_oauth_tokens SET access_token = $2, expires_at = $3, updated_at = now() WHERE user_id = $1',
    [userId, encryptSecret(accessToken), expiresAt],
  );
}

export async function remove(userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM google_oauth_tokens WHERE user_id = $1', [userId]);
  return (rowCount ?? 0) > 0;
}
