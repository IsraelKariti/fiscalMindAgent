import { env } from '../config/env.js';
import * as whitelist from '../db/queries/whitelist.js';

/**
 * Whether this account may use premium-only features (currently the WhatsApp
 * channel). Admins always may — they are not on the whitelist but need to
 * exercise every feature.
 */
export async function hasPremiumAccess(email: string): Promise<boolean> {
  if (env.ADMIN_EMAILS.includes(email.toLowerCase())) return true;
  return (await whitelist.getTier(email)) === 'premium';
}
