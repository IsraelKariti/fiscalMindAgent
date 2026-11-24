import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveHarelSectors } from '../src/browserRunner/harel.js';

// Harel reports app: one filter round per kind, the תחום option picked by its
// visible label (openspec `harel-fetch`). The labels are the site's own:
// "גמל והשתלמות" (verified live 2026-07-27), "פנסיה" (owner confirmed 2026-11-24).
const OPTIONS = ['בחר', ' ביטוח חיים ', 'גמל והשתלמות', 'פנסיה', 'בריאות'];

describe('harel sector resolution', () => {
  it('maps both kinds to their option labels, study fund first', () => {
    assert.deepEqual(resolveHarelSectors(OPTIONS, ['pension_annual', 'study_fund_annual']), [
      { kind: 'study_fund_annual', label: 'גמל והשתלמות' },
      { kind: 'pension_annual', label: 'פנסיה' },
    ]);
  });

  it('runs only the requested kinds and ignores keys it does not fetch', () => {
    assert.deepEqual(resolveHarelSectors(OPTIONS, ['study_fund_annual', 'form106']), [
      { kind: 'study_fund_annual', label: 'גמל והשתלמות' },
    ]);
  });

  it('fails loudly, listing the labels, when the pension option is missing', () => {
    assert.throws(
      () => resolveHarelSectors(['בחר', 'גמל והשתלמות', 'ביטוח'], ['study_fund_annual', 'pension_annual']),
      (err: Error) => /pension_annual/.test(err.message) && /גמל והשתלמות \| ביטוח/.test(err.message),
    );
  });
});
