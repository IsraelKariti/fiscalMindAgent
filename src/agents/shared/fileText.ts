import { inflateSync } from 'node:zlib';

/**
 * Best-effort PDF text layer for the file-track regex step, without a PDF
 * dependency: pulls the string literals of the text-showing operators (Tj, ',
 * ", TJ) out of every content stream, inflating FlateDecode streams.
 *
 * Limits, by design:
 *  - scanned PDFs and images yield '' (no text layer);
 *  - Hebrew in CID-keyed fonts comes out as glyph ids, not letters;
 *  - other filters (LZW, DCT) are skipped.
 * So the result is partial: callers must treat '' / a short result as "not
 * checkable", never as "clean" — the multimodal LLM scan still reads the bytes.
 */

const MAX_TEXT = 20_000;

/** The literals inside (…) Tj / ' / " and [ … ] TJ, unescaped; \ddd octal escapes are dropped. */
function pdfLiterals(content: string): string[] {
  const out: string[] = [];
  const literal = /\(((?:\\.|[^\\)])*)\)\s*(?:Tj|'|")/g;
  const array = /\[((?:\((?:\\.|[^\\)])*\)|[^\]])*)\]\s*TJ/g;
  const unescape = (s: string): string =>
    s
      .replace(/\\\d{1,3}/g, '')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
  let m: RegExpExecArray | null;
  while ((m = literal.exec(content)) !== null) out.push(unescape(m[1] ?? ''));
  while ((m = array.exec(content)) !== null) {
    const inner = /\(((?:\\.|[^\\)])*)\)/g;
    let n: RegExpExecArray | null;
    const parts: string[] = [];
    while ((n = inner.exec(m[1] ?? '')) !== null) parts.push(unescape(n[1] ?? ''));
    out.push(parts.join(''));
  }
  return out;
}

function extractPdfText(bytes: Buffer): string {
  const raw = bytes.toString('latin1');
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  const pieces: string[] = [];
  let total = 0;
  let m: RegExpExecArray | null;
  while ((m = streamRe.exec(raw)) !== null && total < MAX_TEXT) {
    const chunk = Buffer.from(m[1] ?? '', 'latin1');
    let content: string;
    try {
      content = inflateSync(chunk).toString('latin1');
    } catch {
      content = chunk.toString('latin1');
    }
    const text = pdfLiterals(content).join(' ').replace(/\s+/g, ' ').trim();
    if (text) {
      pieces.push(text);
      total += text.length;
    }
  }
  return pieces.join(' ').slice(0, MAX_TEXT);
}

/** '' for anything that is not a PDF, and on any parse failure — never throws. */
export function extractFileText(bytes: Buffer, contentType: string): string {
  const mime = (contentType.toLowerCase().split(';')[0] ?? '').trim();
  if (mime !== 'application/pdf') return '';
  try {
    return extractPdfText(bytes);
  } catch {
    return '';
  }
}
