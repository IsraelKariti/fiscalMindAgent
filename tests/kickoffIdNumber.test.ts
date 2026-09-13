import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { crmIdNumber } from '../src/agents/declarationOfCapital/crmIdentity.js';
import type { ItemColumnDetail } from '../src/agents/shared/mondayData.js';

const VALID_ID = '123456782';
const BAD_ID = '123456789';

function col(title: string, text: string, type = 'text'): ItemColumnDetail {
  return { id: title.toLowerCase().replace(/\W+/g, '_'), title, type, text, linkedItemIds: [] };
}

test('an English "id" column is the client id', () => {
  const columns = [col('Email', 'israel@example.com'), col('phone', '0506839593'), col('id', VALID_ID)];
  assert.equal(crmIdNumber(columns), VALID_ID);
});

test('Hebrew titles in every punctuation form qualify', () => {
  for (const title of ['מספר זהות', 'תעודת זהות', 'ת"ז', 'ת.ז', 'ת״ז', 'תז', "מס' זהות", 'ID Number', 'National ID', 'Identity']) {
    assert.equal(crmIdNumber([col('phone', '0506839593'), col(title, '12-345-6782')]), VALID_ID, title);
  }
});

test('among several candidates the checksum-valid one wins, else the first', () => {
  assert.equal(crmIdNumber([col("מס' זהות", BAD_ID), col('ת.ז', VALID_ID)]), VALID_ID);
  assert.equal(crmIdNumber([col('ת.ז', VALID_ID), col("מס' זהות", BAD_ID)]), VALID_ID);
  assert.equal(crmIdNumber([col('id', BAD_ID), col('ת.ז', '987654321')]), BAD_ID);
});

test('unrelated or monday-internal titles, empty cells and short values are ignored', () => {
  assert.equal(crmIdNumber([col('phone', '0506839593'), col('Email', 'a@b.c')]), null);
  assert.equal(crmIdNumber([col('item id', VALID_ID), col('Board ID', VALID_ID), col('monday id', VALID_ID)]), null);
  assert.equal(crmIdNumber([col('id', '')]), null);
  assert.equal(crmIdNumber([col('id', '1234')]), null);
  assert.equal(crmIdNumber([]), null);
});
