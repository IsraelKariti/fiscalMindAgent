/**
 * Per-instance sender addresses are assigned only by an admin — at activation
 * (mandatory for types that email clients) or via the agent page's address
 * form. There is deliberately no auto-derivation: an agent must never start
 * emailing clients from an address nobody agreed to. Read an instance's
 * address with agentMailboxes.getByInstanceId.
 */

/** RFC 5322 display-name From header; falls back to the bare address when there's no name. */
export function formatFrom(displayName: string | null, address: string): string {
  const name = displayName?.replace(/[\r\n"<>]/g, '').trim();
  return name ? `"${name}" <${address}>` : address;
}
