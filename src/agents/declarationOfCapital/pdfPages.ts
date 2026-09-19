import { PDFDocument } from 'pdf-lib';

/**
 * The only module that touches the PDF library: reading a file's page count
 * and cutting it into one PDF per page range. Both throw on a PDF the library
 * cannot open (encrypted, damaged) — the caller treats a throw as "no split".
 */

/** A run of consecutive pages, 1-based and inclusive. */
export interface PageRange {
  from: number;
  to: number;
}

export async function readPdfPageCount(bytes: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPageCount();
}

/** One new PDF per range, holding exactly that range's pages in order. Ranges must lie inside the file. */
export async function cutPdf(bytes: Buffer, ranges: PageRange[]): Promise<Buffer[]> {
  const source = await PDFDocument.load(bytes);
  const pageCount = source.getPageCount();
  const parts: Buffer[] = [];
  for (const range of ranges) {
    if (range.from < 1 || range.to > pageCount || range.from > range.to) {
      throw new Error(`page range ${range.from}-${range.to} is outside the file (${pageCount} pages)`);
    }
    const part = await PDFDocument.create();
    const indices = Array.from({ length: range.to - range.from + 1 }, (_, i) => range.from - 1 + i);
    for (const page of await part.copyPages(source, indices)) part.addPage(page);
    parts.push(Buffer.from(await part.save()));
  }
  return parts;
}
