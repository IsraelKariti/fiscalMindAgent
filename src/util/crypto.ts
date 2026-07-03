import crypto from 'node:crypto';
import { env } from '../config/env.js';

/**
 * AES-256-GCM encryption for Gmail refresh tokens at rest in Postgres.
 * Wire format (base64 fields, dot-separated): iv.ciphertext.authTag
 */

function key(): Buffer {
  if (!env.TOKEN_ENCRYPTION_KEY) {
    throw new Error('TOKEN_ENCRYPTION_KEY is not set (64 hex chars); required to store/read Gmail tokens.');
  }
  return Buffer.from(env.TOKEN_ENCRYPTION_KEY, 'hex');
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return `${iv.toString('base64')}.${ciphertext.toString('base64')}.${cipher.getAuthTag().toString('base64')}`;
}

export function decryptSecret(encoded: string): string {
  const [iv, ciphertext, authTag] = encoded.split('.');
  if (!iv || !ciphertext || !authTag) throw new Error('decryptSecret: malformed payload');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, 'base64')), decipher.final()]).toString('utf8');
}
