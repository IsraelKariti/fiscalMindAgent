import * as emails from '../db/queries/emails.js';

/**
 * Meta's 24-hour customer-service window: free-form WhatsApp messages are only
 * deliverable within 24h of the client's last inbound WhatsApp message.
 * Outside the window only pre-approved Content Templates can be sent.
 */
export const WHATSAPP_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function lastInboundWhatsAppAt(clientId: string): Promise<Date | null> {
  return emails.lastInboundWhatsAppAt(clientId);
}

export function windowCloseTime(lastInboundAt: Date | null): Date | null {
  return lastInboundAt ? new Date(lastInboundAt.getTime() + WHATSAPP_WINDOW_MS) : null;
}

export async function isWhatsAppWindowOpen(clientId: string, now = new Date()): Promise<boolean> {
  const closesAt = windowCloseTime(await lastInboundWhatsAppAt(clientId));
  return closesAt !== null && now < closesAt;
}
