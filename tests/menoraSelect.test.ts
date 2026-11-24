import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  menoraKindOf,
  normalizeMenoraPhone,
  parseMenoraRowLabel,
  selectMenoraRows,
  type MenoraRow,
} from '../src/browserRunner/menora.js';

// Menora phone normalization and row selection (openspec `menora-fetch`). The
// pension label below is the owner's real row as seen live 2026-11-24; the
// study-fund and insurance labels are invented in the same shape.
const row = (index: number, label: string): MenoraRow => ({ index, label });
const PENSION_2018 = 'סוג הדוח: דוח שנתי מקוצר שנה: 2018 מוצר: מנורה מבטחים פנסיה מקיפה תחום פנסיה';
const STUDY_2018 = 'סוג הדוח: דוח שנתי מקוצר שנה: 2018 מוצר: מנורה מבטחים השתלמות תחום גמל והשתלמות';
const LIFE_2018 = 'סוג הדוח: דוח שנתי מקוצר שנה: 2018 מוצר: מנורה מבטחים ביטוח מנהלים תחום ביטוח חיים';

describe('menora phone normalization', () => {
  it('converts the international form and strips spaces, dashes and a plus', () => {
    assert.equal(normalizeMenoraPhone('972501234567'), '0501234567');
    assert.equal(normalizeMenoraPhone('+972-50-123 4567'), '0501234567');
    assert.equal(normalizeMenoraPhone('050-1234567'), '0501234567');
  });

  it('leaves a local number unchanged', () => {
    assert.equal(normalizeMenoraPhone('0501234567'), '0501234567');
  });
});

describe('menora row label', () => {
  it('splits the aria-label into type, year, product and sector', () => {
    assert.deepEqual(parseMenoraRowLabel(PENSION_2018), {
      type: 'דוח שנתי מקוצר',
      year: '2018',
      product: 'מנורה מבטחים פנסיה מקיפה',
      sector: 'פנסיה',
    });
    assert.equal(parseMenoraRowLabel('דוח צבירות פנסיה מנורה מבטחים פנסיה מקיפה'), null);
  });

  it('reads the kind from the sector, never from the title', () => {
    assert.equal(menoraKindOf('פנסיה'), 'pension_annual');
    assert.equal(menoraKindOf('גמל והשתלמות'), 'study_fund_annual');
    assert.equal(menoraKindOf('ביטוח חיים'), null);
    assert.equal(menoraKindOf('ביטוח בריאות'), null);
  });
});

describe('menora row selection', () => {
  it('keeps the pension row of the year, titled by its type, year and product', () => {
    assert.deepEqual(selectMenoraRows([row(0, PENSION_2018)], 2018), [
      { index: 0, title: 'דוח שנתי מקוצר 2018 — מנורה מבטחים פנסיה מקיפה', kind: 'pension_annual' },
    ]);
  });

  it('skips a row of another year and a row of an insurance sector', () => {
    const rows = [row(0, PENSION_2018), row(1, STUDY_2018), row(2, LIFE_2018)];
    assert.deepEqual(
      selectMenoraRows(rows, 2018).map((r) => [r.index, r.kind]),
      [
        [0, 'pension_annual'],
        [1, 'study_fund_annual'],
      ],
    );
    assert.equal(selectMenoraRows(rows, 2019).length, 0);
  });

  it('downloads the same title once within a kind', () => {
    const seen = new Set<string>();
    assert.equal(selectMenoraRows([row(0, PENSION_2018), row(3, PENSION_2018)], 2018, seen).length, 1);
    assert.equal(selectMenoraRows([row(0, PENSION_2018)], 2018, seen).length, 0);
  });
});
