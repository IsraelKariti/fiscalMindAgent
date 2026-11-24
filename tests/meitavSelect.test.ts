import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MEITAV_PHONE_PREFIXES,
  meitavKindOf,
  normalizeMeitavTitle,
  selectMeitavRows,
  splitMeitavPhone,
  type MeitavRow,
} from '../src/browserRunner/meitav.js';

// Meitav phone split and row selection (openspec `meitav-fetch`). Row titles
// below are the owner's real rows as seen live 2026-11-24.
const row = (index: number, title: string): MeitavRow => ({ index, title });

describe('meitav phone split', () => {
  it('converts the international form and strips spaces and dashes', () => {
    assert.deepEqual(splitMeitavPhone('972501234567'), { prefix: '050', digits: '1234567' });
    assert.deepEqual(splitMeitavPhone('+972-50-123 4567'), { prefix: '050', digits: '1234567' });
    assert.deepEqual(splitMeitavPhone('050-1234567'), { prefix: '050', digits: '1234567' });
  });

  it('accepts every prefix the form offers', () => {
    for (const prefix of MEITAV_PHONE_PREFIXES) {
      assert.deepEqual(splitMeitavPhone(`${prefix}7654321`), { prefix, digits: '7654321' });
    }
  });

  it('rejects a landline prefix and a wrong length before the site is touched', () => {
    assert.throws(() => splitMeitavPhone('035551234'), /prefix/);
    assert.throws(() => splitMeitavPhone('0561234567'), /prefix/);
    assert.throws(() => splitMeitavPhone('050123456'), /7 digits/);
    assert.throws(() => splitMeitavPhone('05012345678'), /7 digits/);
  });
});

describe('meitav card kinds', () => {
  it('reads the kind from the card header, never from the row title', () => {
    assert.equal(meitavKindOf('פנסיה'), 'pension_annual');
    assert.equal(meitavKindOf('קופת גמל להשקעה'), 'pension_annual');
    assert.equal(meitavKindOf('קרן השתלמות'), 'study_fund_annual');
    assert.equal(meitavKindOf('השתלמות'), 'study_fund_annual');
    assert.equal(meitavKindOf('ביטוח בריאות'), null);
    assert.equal(meitavKindOf(''), null);
  });
});

describe('meitav row selection', () => {
  it('keeps the detailed and the short annual report of the year, tagged by the card', () => {
    const rows = [row(0, 'דוח שנתי מפורט דצמבר 2023'), row(1, 'דוח שנתי מקוצר דצמבר 2023')];
    assert.deepEqual(selectMeitavRows(rows, 2023, 'pension_annual'), [
      { index: 0, title: 'דוח שנתי מפורט דצמבר 2023', kind: 'pension_annual' },
      { index: 1, title: 'דוח שנתי מקוצר דצמבר 2023', kind: 'pension_annual' },
    ]);
  });

  it('skips quarterly reports and a title that does not carry the tax year', () => {
    const rows = [row(0, 'דוח רבעוני ספטמבר 2026'), row(1, 'דוח שנתי מפורט דצמבר 2022'), row(2, 'דוח שנתי מקוצר דצמבר 2023')];
    assert.deepEqual(
      selectMeitavRows(rows, 2023, 'pension_annual').map((r) => r.index),
      [2],
    );
    assert.equal(selectMeitavRows([row(0, 'דוח רבעוני יוני 2023')], 2023, 'pension_annual').length, 0);
  });

  it('downloads the same title once within a kind, but keeps it for the other kind', () => {
    const seen = new Set<string>();
    const rows = [row(0, 'דוח שנתי מפורט דצמבר 2023'), row(3, 'דוח שנתי מפורט דצמבר 2023')];
    assert.equal(selectMeitavRows(rows, 2023, 'pension_annual', seen).length, 1);
    assert.equal(selectMeitavRows(rows, 2023, 'pension_annual', seen).length, 0);
    assert.equal(selectMeitavRows(rows, 2023, 'study_fund_annual', seen).length, 1);
  });

  it('normalizes the title whitespace and keeps the row index for the click', () => {
    assert.equal(normalizeMeitavTitle('  דוח שנתי  מקוצר דצמבר 2023 '), 'דוח שנתי מקוצר דצמבר 2023');
    const picked = selectMeitavRows([row(4, ' דוח שנתי  מקוצר דצמבר 2023 ')], 2023, 'study_fund_annual');
    assert.deepEqual(picked, [{ index: 4, title: 'דוח שנתי מקוצר דצמבר 2023', kind: 'study_fund_annual' }]);
  });
});
