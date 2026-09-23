import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { crmIdNumber, crmMaritalStatus, crmSpouse, spouseFromCards } from '../src/agents/declarationOfCapital/crmIdentity.js';
import { EMPTY_SPOUSE, type SpouseOnFile } from '../src/agents/declarationOfCapital/spouseIdentity.js';
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

test('a spouse-titled id cell is never the client id; it is the spouse id (openspec spouse-identity)', () => {
  const columns = [col('ת"ז', VALID_ID), col('ת"ז בן/בת זוג', '012345542')];
  assert.equal(crmIdNumber(columns), VALID_ID);
  assert.deepEqual(crmSpouse(columns), { name: null, idNumber: '012345542' });
  // Only a spouse id cell: the client has none on the card.
  assert.equal(crmIdNumber([col('תעודת זהות בן זוג', VALID_ID)]), null);
  for (const title of ['ת"ז בן/בת הזוג', 'מספר זהות בת זוג', 'תז בן או בת זוג', 'Spouse ID', 'partner id number']) {
    assert.equal(crmIdNumber([col(title, VALID_ID)]), null, title);
    assert.equal(crmSpouse([col(title, '12-345-6782')]).idNumber, VALID_ID, title);
  }
  // Checksum-valid candidate preferred, else the first; short values ignored.
  assert.equal(crmSpouse([col('ת"ז בן זוג', BAD_ID), col('spouse id', VALID_ID)]).idNumber, VALID_ID);
  assert.equal(crmSpouse([col('ת"ז בן זוג', '1234')]).idNumber, null);
});

test('a spouse-titled cell without an id title is the spouse name', () => {
  assert.deepEqual(crmSpouse([col('שם בן/בת הזוג', ' מיכל תמיר ')]), { name: 'מיכל תמיר', idNumber: null });
  assert.equal(crmSpouse([col('בן/בת זוג', 'מיכל')]).name, 'מיכל');
  assert.equal(crmSpouse([col('Spouse name', 'Michal Tamir')]).name, 'Michal Tamir');
  // Digits or a single letter are not a name.
  assert.equal(crmSpouse([col('בן/בת זוג', '0501234567')]).name, null);
  assert.equal(crmSpouse([col('בן/בת זוג', 'מ')]).name, null);
  assert.deepEqual(crmSpouse([col('phone', '0506839593'), col('id', VALID_ID)]), { name: null, idNumber: null });
  assert.deepEqual(crmSpouse([col('שם בן/בת הזוג', '')]), { name: null, idNumber: null });
  // Name and id together.
  assert.deepEqual(crmSpouse([col('שם בן/בת הזוג', 'מיכל תמיר'), col('ת"ז בן/בת הזוג', VALID_ID)]), { name: 'מיכל תמיר', idNumber: VALID_ID });
});

test('marital status: married / not married / unknown', () => {
  assert.equal(crmMaritalStatus([col('סטטוס משפחתי', 'נשוי/אה')]), 'married');
  assert.equal(crmMaritalStatus([col('מצב משפחתי', 'נשואה')]), 'married');
  assert.equal(crmMaritalStatus([col('Marital status', 'Married')]), 'married');
  for (const v of ['רווק/ה', 'גרושה', 'אלמן', 'פרוד', 'single', 'Divorced', 'widowed', 'separated']) {
    assert.equal(crmMaritalStatus([col('סטטוס משפחתי', v)]), 'not_married', v);
  }
  assert.equal(crmMaritalStatus([col('סטטוס משפחתי', 'ידוע/ה בציבור')]), null);
  assert.equal(crmMaritalStatus([col('סטטוס משפחתי', '')]), null);
  assert.equal(crmMaritalStatus([col('phone', '0506839593')]), null);
});

test('spouseFromCards: questionnaire first, CRM second, never clearing a document-inferred value', () => {
  const inferred: SpouseOnFile = { name: 'מיכל תמיר', idNumber: '012345542', nameSource: 'document', idSource: 'document' };
  // Neither card says anything: the inferred spouse stays, status unknown.
  assert.deepEqual(spouseFromCards(inferred, [col('סטטוס משפחתי', '')], [col('id', VALID_ID)]), { spouse: inferred, maritalStatus: null });
  // The questionnaire id replaces the inferred id; the name it did not state stays.
  const fromForm = spouseFromCards(inferred, [col('ת"ז בן/בת הזוג', VALID_ID), col('סטטוס משפחתי', 'נשוי/אה')], []);
  assert.deepEqual(fromForm, {
    spouse: { name: 'מיכל תמיר', idNumber: VALID_ID, nameSource: 'document', idSource: 'questionnaire' },
    maritalStatus: 'married',
  });
  // CRM fills the name the questionnaire lacks, but cannot beat the questionnaire's id.
  const both = spouseFromCards(EMPTY_SPOUSE, [col('ת"ז בן/בת הזוג', VALID_ID)], [col('שם בן/בת הזוג', 'מיכל'), col('ת"ז בן זוג', '012345542'), col('מצב משפחתי', 'גרוש')]);
  assert.deepEqual(both, {
    spouse: { name: 'מיכל', idNumber: VALID_ID, nameSource: 'crm', idSource: 'questionnaire' },
    maritalStatus: 'not_married',
  });
  // Married with no spouse cells: nothing on file, the spouse may come from a document later.
  assert.deepEqual(spouseFromCards(EMPTY_SPOUSE, [col('סטטוס משפחתי', 'נשוי/אה')], []), { spouse: EMPTY_SPOUSE, maritalStatus: 'married' });
});

test('unrelated or monday-internal titles, empty cells and short values are ignored', () => {
  assert.equal(crmIdNumber([col('phone', '0506839593'), col('Email', 'a@b.c')]), null);
  assert.equal(crmIdNumber([col('item id', VALID_ID), col('Board ID', VALID_ID), col('monday id', VALID_ID)]), null);
  assert.equal(crmIdNumber([col('id', '')]), null);
  assert.equal(crmIdNumber([col('id', '1234')]), null);
  assert.equal(crmIdNumber([]), null);
});
