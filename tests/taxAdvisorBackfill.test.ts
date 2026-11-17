import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { advisorChanged, boardForRow, memoisedUsersLookup, rememberedRow } from '../src/agents/declarationOfCapital/taxAdvisorBackfillRules.js';
import type { StoredTaxAdvisor } from '../src/agents/declarationOfCapital/taxAdvisor.js';

const dana: StoredTaxAdvisor = { name: 'דנה לוי', email: 'dana@office.co.il', monday_user_id: '42', match: 'staff', staff_id: 's1' };

test('advisorChanged: same person and match is unchanged, even with a refreshed name or email', () => {
  assert.equal(advisorChanged(dana, { ...dana, name: 'דנה ל.', email: null }), false);
  assert.equal(advisorChanged(null, null), false);
});

test('advisorChanged: another match, another person, or a person appearing / vanishing is a change', () => {
  assert.equal(advisorChanged(dana, { ...dana, match: 'none' }), true);
  assert.equal(advisorChanged(dana, { ...dana, monday_user_id: '43' }), true);
  assert.equal(advisorChanged(null, dana), true);
  assert.equal(advisorChanged(dana, null), true);
});

test('rememberedRow: both ids must be non-empty strings', () => {
  assert.deepEqual(rememberedRow({ agent_fields: { monday_board_id: 'b1', monday_item_id: 'i1' } }), { boardId: 'b1', itemId: 'i1' });
  assert.equal(rememberedRow({ agent_fields: {} }), null);
  assert.equal(rememberedRow({ agent_fields: { monday_board_id: 'b1' } }), null);
  assert.equal(rememberedRow({ agent_fields: { monday_board_id: 'b1', monday_item_id: 7 } }), null);
  assert.equal(rememberedRow({ agent_fields: { monday_board_id: '', monday_item_id: 'i1' } }), null);
});

test('boardForRow: only a configured board that maps the advisor column counts', () => {
  const settings = {
    boards: [
      { boardId: 'mapped', crmLinkColumnId: 'crm', yearColumnId: 'year', taxAdvisorColumnId: 'people' },
      { boardId: 'unmapped', crmLinkColumnId: 'crm', yearColumnId: 'year' },
    ],
    sheets: [],
  };
  assert.equal(boardForRow({ settings }, 'mapped')?.taxAdvisorColumnId, 'people');
  assert.equal(boardForRow({ settings }, 'unmapped'), null);
  assert.equal(boardForRow({ settings }, 'unknown'), null);
  assert.equal(boardForRow({ settings: {} }, 'mapped'), null);
});

test('memoisedUsersLookup: the same ids are fetched once per run', async () => {
  let calls = 0;
  const lookup = memoisedUsersLookup(async (_token, ids) => {
    calls += 1;
    return ids.map((id) => ({ id, name: 'n', email: 'e' }));
  });
  await lookup('t', ['1']);
  await lookup('t', ['1']);
  await lookup('t', ['2']);
  assert.equal(calls, 2);
});
