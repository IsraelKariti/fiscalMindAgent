import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import ExcelJS from 'exceljs';
import {
  CSV_CONTENT_TYPE,
  CUT_LINE,
  MAX_ROWS_PER_SHEET,
  XLSX_CONTENT_TYPE,
  checkZipEntrySizes,
  isSpreadsheetType,
  parseCsv,
  renderSpreadsheetText,
} from '../src/agents/shared/spreadsheetText.js';

type Cell = string | number | boolean | Date | null | { formula: string; result: number | string };

async function workbook(sheets: Record<string, Cell[][]>): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = wb.addWorksheet(name);
    rows.forEach((cells, r) => {
      cells.forEach((cell, c) => {
        if (cell !== null) sheet.getCell(r + 1, c + 1).value = cell;
      });
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

test('isSpreadsheetType: xlsx and csv only, parameters ignored', () => {
  assert.equal(isSpreadsheetType(XLSX_CONTENT_TYPE), true);
  assert.equal(isSpreadsheetType('text/csv; charset=utf-8'), true);
  assert.equal(isSpreadsheetType('application/vnd.ms-excel'), false);
  assert.equal(isSpreadsheetType('application/pdf'), false);
});

test('an Altshuler-style label/value sheet renders its four rows, no empty rows, tab-separated', async () => {
  const bytes = await workbook({
    גיליון1: [
      ['תיאור', 'ערך'],
      ['שם הקופה', 'אלטשולר שחם השתלמות כללי'],
      [null, null],
      ['סכום שנותר לתשלום', '₪81,382'],
      ...Array.from({ length: 300 }, () => [null, null] as Cell[]),
      ['נכון לתאריך', '31.12.2025'],
    ],
  });
  const text = await renderSpreadsheetText(bytes, XLSX_CONTENT_TYPE);
  assert.equal(
    text,
    ['--- sheet: גיליון1 ---', 'תיאור\tערך', 'שם הקופה\tאלטשולר שחם השתלמות כללי', 'סכום שנותר לתשלום\t₪81,382', 'נכון לתאריך\t31.12.2025'].join('\n'),
  );
});

test('a row with two loan values renders three cells; a date cell renders dd.mm.yyyy; formulas by result', async () => {
  const bytes = await workbook({
    Loans: [
      ['סכום שנותר לתשלום', '₪81,382', '₪20,045'],
      ['נכון לתאריך', new Date(Date.UTC(2025, 11, 31))],
      ['סה"כ', { formula: 'B1+C1', result: 101427 }, 0.1 + 0.2, true],
    ],
  });
  const text = await renderSpreadsheetText(bytes, XLSX_CONTENT_TYPE);
  const lines = text.split('\n');
  assert.equal(lines[1], 'סכום שנותר לתשלום\t₪81,382\t₪20,045');
  assert.equal(lines[2], 'נכון לתאריך\t31.12.2025');
  assert.equal(lines[3], 'סה"כ\t101427\t0.3\ttrue');
});

test('a huge sheet stops at the row cap and ends with the cut line', async () => {
  const rows = Array.from({ length: 5_000 }, (_, i) => [`row ${i + 1}`, i + 1] as Cell[]);
  const bytes = await workbook({ Big: rows });
  const text = await renderSpreadsheetText(bytes, XLSX_CONTENT_TYPE);
  const lines = text.split('\n');
  assert.equal(lines[0], '--- sheet: Big ---');
  assert.equal(lines.length, 1 + MAX_ROWS_PER_SHEET + 1);
  assert.equal(lines[MAX_ROWS_PER_SHEET], `row ${MAX_ROWS_PER_SHEET}\t${MAX_ROWS_PER_SHEET}`);
  assert.equal(lines[lines.length - 1], CUT_LINE);
});

test('two sheets render in order, each under its own name', async () => {
  const bytes = await workbook({ First: [['a', 'b']], Second: [['c']] });
  const text = await renderSpreadsheetText(bytes, XLSX_CONTENT_TYPE);
  assert.equal(text, '--- sheet: First ---\na\tb\n--- sheet: Second ---\nc');
});

test('random bytes with the xlsx type throw', async () => {
  await assert.rejects(renderSpreadsheetText(Buffer.from('this is not a workbook at all, just text'), XLSX_CONTENT_TYPE));
  assert.throws(() => checkZipEntrySizes(Buffer.alloc(100)));
});

test('a CSV with quoted fields, a BOM and CRLF renders correctly', async () => {
  const csv = '﻿תיאור,ערך\r\n"שם הקופה","אלטשולר, שחם"\r\n"ציטוט","אמר ""שלום"""\r\n,\r\nסכום,"81,382"\r\n';
  const text = await renderSpreadsheetText(Buffer.from(csv, 'utf8'), CSV_CONTENT_TYPE);
  assert.equal(text, ['תיאור\tערך', 'שם הקופה\tאלטשולר, שחם', 'ציטוט\tאמר "שלום"', 'סכום\t81,382'].join('\n'));
});

test('a semicolon CSV picks the semicolon delimiter', () => {
  assert.deepEqual(parseCsv(Buffer.from('a;b;c\n1;2;3\n')), [
    ['a', 'b', 'c'],
    ['1', '2', '3'],
  ]);
});
