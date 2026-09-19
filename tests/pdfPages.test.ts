import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';
import { cutPdf, readPdfPageCount } from '../src/agents/declarationOfCapital/pdfPages.js';

/** A PDF whose page N is (100 + N) points wide, so a cut page can be told apart by its width. */
async function pdfWithPages(count: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let n = 1; n <= count; n += 1) pdf.addPage([100 + n, 200]);
  return Buffer.from(await pdf.save());
}

async function pageWidths(bytes: Buffer): Promise<number[]> {
  const pdf = await PDFDocument.load(bytes);
  return pdf.getPages().map((p) => p.getWidth());
}

test('reads the page count of a PDF', async () => {
  assert.equal(await readPdfPageCount(await pdfWithPages(5)), 5);
});

test('cuts a five-page PDF into 1-3 and 4-5, keeping the pages and their order', async () => {
  const parts = await cutPdf(await pdfWithPages(5), [
    { from: 1, to: 3 },
    { from: 4, to: 5 },
  ]);
  assert.equal(parts.length, 2);
  assert.deepEqual(await pageWidths(parts[0]!), [101, 102, 103]);
  assert.deepEqual(await pageWidths(parts[1]!), [104, 105]);
});

test('a single-page range gives a one-page PDF', async () => {
  const [part] = await cutPdf(await pdfWithPages(3), [{ from: 2, to: 2 }]);
  assert.deepEqual(await pageWidths(part!), [102]);
});

test('a range outside the file throws', async () => {
  await assert.rejects(cutPdf(await pdfWithPages(3), [{ from: 2, to: 4 }]), /outside the file/);
});

test('a buffer that is not a PDF throws', async () => {
  const garbage = Buffer.from('this is not a pdf');
  await assert.rejects(readPdfPageCount(garbage));
  await assert.rejects(cutPdf(garbage, [{ from: 1, to: 1 }]));
});
