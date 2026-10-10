import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import { toModelFile } from '../src/agents/shared/modelFile.js';
import { XLSX_CONTENT_TYPE, renderSpreadsheetText } from '../src/agents/shared/spreadsheetText.js';
import { isAnalyzable } from '../src/agents/declarationOfCapital/analyzeFile.js';

const MB = 1024 * 1024;

test('a PDF keeps its bytes and type; its text layer is the text', async () => {
  const pdf = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Length 0 >>\nstream\nBT (Balance certificate) Tj ET\nendstream\nendobj\n%%EOF', 'latin1');
  const model = await toModelFile({ bytes: pdf, contentType: 'application/pdf' });
  assert.equal(model.contentType, 'application/pdf');
  assert.ok(model.bytes.equals(pdf));
  assert.ok(model.text.includes('Balance certificate'));
});

test('an image passes through with no text', async () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
  const model = await toModelFile({ bytes: png, contentType: 'image/png' });
  assert.equal(model.contentType, 'image/png');
  assert.ok(model.bytes.equals(png));
  assert.equal(model.text, '');
});

test('an xlsx becomes text/plain bytes equal to the rendering, which is also the text', async () => {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('הלוואות');
  sheet.getCell(1, 1).value = 'סכום שנותר לתשלום';
  sheet.getCell(1, 2).value = '₪81,382';
  const bytes = Buffer.from(await wb.xlsx.writeBuffer());
  const model = await toModelFile({ bytes, contentType: XLSX_CONTENT_TYPE });
  const rendering = await renderSpreadsheetText(bytes, XLSX_CONTENT_TYPE);
  assert.equal(model.contentType, 'text/plain');
  assert.equal(model.bytes.toString('utf8'), rendering);
  assert.equal(model.text, rendering);
  assert.ok(rendering.includes('סכום שנותר לתשלום\t₪81,382'));
});

test('a damaged xlsx rejects', async () => {
  await assert.rejects(toModelFile({ bytes: Buffer.from('nope'), contentType: XLSX_CONTENT_TYPE }));
});

test('isAnalyzable: spreadsheets up to 5 MB, PDFs up to 14 MB, legacy xls never', () => {
  assert.equal(isAnalyzable(XLSX_CONTENT_TYPE, 11_105), true);
  assert.equal(isAnalyzable('text/csv; charset=utf-8', 500), true);
  assert.equal(isAnalyzable(XLSX_CONTENT_TYPE, 6 * MB), false);
  assert.equal(isAnalyzable('application/pdf', 6 * MB), true);
  assert.equal(isAnalyzable('application/pdf', 15 * MB), false);
  assert.equal(isAnalyzable('application/vnd.ms-excel', 500), false);
  assert.equal(isAnalyzable('application/msword', 500), false);
});
