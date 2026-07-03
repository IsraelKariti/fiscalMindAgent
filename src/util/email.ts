/** Parses a "Display Name <address@example.com>" or bare "address@example.com" header into just the address. */
export function parseEmailAddress(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/);
  return (match?.[1] ?? headerValue).trim().toLowerCase();
}
