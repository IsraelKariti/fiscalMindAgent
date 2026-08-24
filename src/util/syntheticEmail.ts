/**
 * Placeholder addresses for clients that exist only on WhatsApp
 * (clients.email_address is NOT NULL + unique per instance, so a synthetic
 * address is derived from the phone number). Shared by customer-service
 * auto-enrollment and WhatsApp-only agents' client imports; anything that
 * emails clients must treat these as "no email address".
 */
export function syntheticWaEmail(waPhone: string): string {
  return `wa-${waPhone.replace(/\D/g, '')}@wa.invalid`;
}

export function isSyntheticWaEmail(emailAddress: string): boolean {
  return emailAddress.toLowerCase().endsWith('@wa.invalid');
}
