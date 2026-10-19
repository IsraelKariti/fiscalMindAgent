/**
 * The delivery status an accountant-email step shows (openspec
 * `conversation-trace`): Resend's `last_event` folded into three colours. Pure,
 * so the step modal's badge is unit-tested without the SDK.
 */
export type EmailDeliveryStatus = 'delivered' | 'pending' | 'failed';

const DELIVERED = new Set(['delivered', 'opened', 'clicked']);
const PENDING = new Set(['queued', 'sent', 'scheduled', 'delivery_delayed']);

/** Resend's last event word → the badge status; an unknown word counts as failed so nothing is shown as fine by mistake. */
export function emailDeliveryStatus(lastEvent: string): { status: EmailDeliveryStatus; event: string } {
  if (DELIVERED.has(lastEvent)) return { status: 'delivered', event: lastEvent };
  if (PENDING.has(lastEvent)) return { status: 'pending', event: lastEvent };
  return { status: 'failed', event: lastEvent };
}

/** True for the stand-in id the outbound fence returns instead of sending (util/outboundGuard.ts · blockedId). */
export function isBlockedSendId(resendId: string): boolean {
  return resendId.startsWith('blocked-');
}
