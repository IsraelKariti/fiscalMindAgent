import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';

/**
 * At-rest encryption for secrets stored in Postgres (client tax-portal
 * credentials, Google/monday OAuth tokens). AES-256-GCM, random IV per value,
 * key from SECRET_ENC_KEY — never stored in the DB, so a DB dump alone cannot
 * decrypt. Encrypt/decrypt happens inside the owning src/db/queries module;
 * callers only ever see plaintext values.
 *
 * Stored format: `enc:v1:` + base64(iv[12] | authTag[16] | ciphertext). The
 * version prefix leaves room for key rotation (a v2 key decrypting old values
 * re-encrypted by re-running scripts/encryptSecrets.ts).
 */

const PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function loadKey(): Buffer {
  const key = Buffer.from(env.SECRET_ENC_KEY, 'base64');
  if (key.length !== 32) {
    throw new Error('SECRET_ENC_KEY must decode to 32 bytes — generate one with: openssl rand -base64 32');
  }
  return key;
}

const key = loadKey();

export function isEncrypted(value: string): boolean {
  return value.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
}

/**
 * Values without the prefix are legacy plaintext rows written before the
 * encryption layer existed — passed through so a deploy stays safe until
 * `npm run db:encrypt-secrets` backfills them.
 */
export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) {
    logger.warn('secretBox: read a legacy plaintext secret — run `npm run db:encrypt-secrets` to backfill');
    return stored;
  }
  const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
  const iv = raw.subarray(0, IV_LENGTH);
  const tag = raw.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = raw.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
