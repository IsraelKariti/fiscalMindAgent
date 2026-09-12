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
 *
 * Everything here runs synchronously on the web process's event loop, over
 * bytes a client sent, so it must be linear in the input: a single left-to-
 * right pass with no regex over stream content. (A backtracking regex for
 * `[ … ] TJ` once took exponential time on an embedded font's binary table —
 * dozens of stray `(x)` pairs and no closing `] TJ` — and froze the whole API
 * for good.)
 */

const MAX_TEXT = 20_000;
/** Inflated bytes a single stream may expand to before it is skipped (zip-bomb guard). */
const MAX_INFLATED = 8 * 1024 * 1024;

const WHITESPACE = new Set([' ', '\t', '\r', '\n', '\f', '\0']);

/** True when a text-showing operator follows position `i` after optional whitespace. */
function operatorAt(content: string, i: number, ops: readonly string[]): boolean {
  while (i < content.length && WHITESPACE.has(content[i]!)) i++;
  return ops.some((op) => content.startsWith(op, i));
}

const STRING_OPS = ['Tj', "'", '"'] as const;
const ARRAY_OPS = ['TJ'] as const;

/**
 * Reads the literal string that opens at content[start] === '(' — balanced
 * nested parentheses, `\`-escapes, `\ddd` octal escapes dropped — and returns
 * the unescaped text plus the index just past the closing ')'. An unterminated
 * literal runs to the end of the content.
 */
function readLiteral(content: string, start: number): { text: string; end: number } {
  let out = '';
  let depth = 0;
  let i = start;
  while (i < content.length) {
    const ch = content[i]!;
    if (ch === '\\') {
      const next = content[i + 1];
      if (next === undefined) return { text: out, end: i + 1 };
      if (next >= '0' && next <= '7') {
        let j = i + 1;
        while (j < i + 4 && j < content.length && content[j]! >= '0' && content[j]! <= '7') j++;
        i = j;
        continue;
      }
      if (next === '\r') {
        // Line continuation: backslash-EOL is dropped (\r\n counts as one EOL).
        i += content[i + 2] === '\n' ? 3 : 2;
        continue;
      }
      if (next !== '\n') out += next;
      i += 2;
      continue;
    }
    if (ch === '(') {
      if (depth > 0) out += ch;
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return { text: out, end: i + 1 };
      out += ch;
    } else {
      out += ch;
    }
    i++;
  }
  return { text: out, end: i };
}

/**
 * The literals shown by `(…) Tj` / `'` / `"` and by `[ … ] TJ`, in stream
 * order — one pass, O(content length).
 */
function pdfLiterals(content: string): string[] {
  const out: string[] = [];
  let arrayParts: string[] | null = null;
  let i = 0;
  while (i < content.length) {
    const ch = content[i]!;
    if (ch === '(') {
      const literal = readLiteral(content, i);
      i = literal.end;
      if (arrayParts) arrayParts.push(literal.text);
      if (operatorAt(content, i, STRING_OPS)) out.push(literal.text);
    } else if (ch === '[') {
      arrayParts = [];
      i++;
    } else if (ch === ']') {
      if (arrayParts && operatorAt(content, i + 1, ARRAY_OPS)) out.push(arrayParts.join(''));
      arrayParts = null;
      i++;
    } else {
      i++;
    }
  }
  return out;
}

/** The raw bytes of every `stream … endstream` section, in file order. */
function* pdfStreams(raw: string): Generator<string> {
  let pos = 0;
  for (;;) {
    const keyword = raw.indexOf('stream', pos);
    if (keyword === -1) return;
    let dataStart = keyword + 'stream'.length;
    if (raw[dataStart] === '\r') dataStart++;
    if (raw[dataStart] !== '\n') {
      // "endstream", or a "stream" that is not the keyword — keep looking.
      pos = keyword + 1;
      continue;
    }
    dataStart++;
    const end = raw.indexOf('endstream', dataStart);
    if (end === -1) return;
    let dataEnd = end;
    if (raw[dataEnd - 1] === '\n') dataEnd--;
    if (raw[dataEnd - 1] === '\r') dataEnd--;
    yield raw.slice(dataStart, dataEnd);
    pos = end + 'endstream'.length;
  }
}

function extractPdfText(bytes: Buffer): string {
  const raw = bytes.toString('latin1');
  const pieces: string[] = [];
  let total = 0;
  for (const data of pdfStreams(raw)) {
    if (total >= MAX_TEXT) break;
    const chunk = Buffer.from(data, 'latin1');
    let content: string;
    try {
      content = inflateSync(chunk, { maxOutputLength: MAX_INFLATED }).toString('latin1');
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
