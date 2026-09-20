// Only these render inline in the viewer modals. Everything else (notably
// text/html and image/svg+xml, which can carry script) downloads as an
// attachment — an inline response executes on the API origin, cookie and all.
export const INLINE_VIEW_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);

/** The disposition a file is actually served with: inline only when asked for AND the type is on the allowlist. */
export function fileDisposition(contentType: string, asked: 'attachment' | 'inline'): 'attachment' | 'inline' {
  return asked === 'inline' && INLINE_VIEW_TYPES.has(contentType) ? 'inline' : 'attachment';
}
