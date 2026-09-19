import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_CHILD_DISPLAY_NAME, childDisplayName, childDownloadName } from '../src/agents/declarationOfCapital/splitChildNames.js';

describe('childDisplayName', () => {
  it('keeps a plain Hebrew document name', () => {
    assert.equal(childDisplayName('אישור יתרות - בנק לאומי'), 'אישור יתרות - בנק לאומי');
  });

  it('returns null for an empty or missing name', () => {
    assert.equal(childDisplayName(''), null);
    assert.equal(childDisplayName('   \n '), null);
    assert.equal(childDisplayName(null), null);
    assert.equal(childDisplayName(undefined), null);
  });

  it('collapses line breaks and drops invisible characters', () => {
    assert.equal(childDisplayName('  אישור\nיתרות‮  בנק  '), 'אישור יתרות בנק');
  });

  it('caps a very long name', () => {
    const name = childDisplayName('א'.repeat(400));
    assert.ok(name !== null);
    assert.equal(name.length, MAX_CHILD_DISPLAY_NAME);
    assert.ok(name.endsWith('…'));
  });
});

describe('childDownloadName', () => {
  it('builds the name from the label, the original base name and the pages', () => {
    assert.equal(childDownloadName('אישור יתרות - בנק לאומי', 'scan.pdf', 1, 2), 'אישור יתרות - בנק לאומי (scan p1-2).pdf');
  });

  it('accepts an original without the .pdf ending, and an upper-case ending', () => {
    assert.equal(childDownloadName('צילום תעודת זהות', 'scan', 3, 4), 'צילום תעודת זהות (scan p3-4).pdf');
    assert.equal(childDownloadName('צילום תעודת זהות', 'SCAN.PDF', 3, 4), 'צילום תעודת זהות (SCAN p3-4).pdf');
  });

  it('replaces characters that are illegal in a file name', () => {
    assert.equal(childDownloadName('דוח שנתי 2024/2025', 'a:b?.pdf', 1, 1), 'דוח שנתי 2024-2025 (a-b- p1-1).pdf');
  });

  it('still names the pages when the original name is empty', () => {
    assert.equal(childDownloadName('חוזה רכישה', '', 5, 9), 'חוזה רכישה (p5-9).pdf');
  });
});
