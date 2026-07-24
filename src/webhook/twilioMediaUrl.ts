/**
 * SSRF guard for inbound WhatsApp media. MediaUrlN values arrive in the
 * webhook POST body, and ingestWaMedia fetches them with the Twilio API
 * credentials attached — so the fetch must be restricted to Twilio's own
 * hosts, never an address the request body chose (attacker server, cloud
 * metadata endpoint, internal service).
 *
 * Real media URLs look like
 * https://api.twilio.com/2010-04-01/Accounts/AC…/Messages/MM…/Media/ME…
 */
export function isAllowedTwilioMediaUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const host = url.hostname.toLowerCase();
  return host === 'twilio.com' || host.endsWith('.twilio.com');
}
