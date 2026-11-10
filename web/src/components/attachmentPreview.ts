/**
 * Which kind of thumbnail an attachment chip can carry (openspec
 * `conversation-attachments`). Mirrors the server's inline allowlist
 * (`INLINE_VIEW_TYPES`): only these types stream inline from `/files/:id/view`,
 * so only these can be drawn in the chip. Anything else keeps the icon chip.
 *
 * Kept free of DOM code so the root test suite can import it.
 */
export type PreviewKind = 'image' | 'pdf';

const IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

export function previewKind(file: { content_type: string }): PreviewKind | null {
  const mime = (file.content_type.toLowerCase().split(';')[0] ?? '').trim();
  if (mime === 'application/pdf') return 'pdf';
  if (IMAGE_TYPES.has(mime)) return 'image';
  return null;
}
