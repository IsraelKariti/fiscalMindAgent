import type { gmail_v1 } from 'googleapis';

export function extractHeader(message: gmail_v1.Schema$Message, name: string): string {
  const header = message.payload?.headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase());
  return header?.value ?? '';
}

/** Parses a "Display Name <address@example.com>" or bare "address@example.com" header into just the address. */
export function parseEmailAddress(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/);
  return (match?.[1] ?? headerValue).trim().toLowerCase();
}

function decodeBase64Url(data: string): string {
  return Buffer.from(data, 'base64url').toString('utf8');
}

function findPlainTextPart(part: gmail_v1.Schema$MessagePart | undefined): string | null {
  if (!part) return null;
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return decodeBase64Url(part.body.data);
  }
  for (const child of part.parts ?? []) {
    const found = findPlainTextPart(child);
    if (found !== null) return found;
  }
  return null;
}

export function extractPlainTextBody(message: gmail_v1.Schema$Message): string {
  const body = findPlainTextPart(message.payload ?? undefined);
  return body ?? '';
}

/** Builds an RFC 2822 message and base64url-encodes it, as required by users.messages.send. */
export function buildRawMessage(args: { to: string; from: string; subject: string; body: string; threadHeaders?: { inReplyTo: string; references: string } }): string {
  const headers = [`To: ${args.to}`, `From: ${args.from}`, `Subject: ${args.subject}`, 'Content-Type: text/plain; charset="UTF-8"'];
  if (args.threadHeaders) {
    headers.push(`In-Reply-To: ${args.threadHeaders.inReplyTo}`);
    headers.push(`References: ${args.threadHeaders.references}`);
  }
  const message = `${headers.join('\r\n')}\r\n\r\n${args.body}`;
  return Buffer.from(message).toString('base64url');
}
