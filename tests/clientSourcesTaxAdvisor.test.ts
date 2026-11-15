import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { parseClientSources } from '../src/agents/shared/clientSources.js';

test('a board carrying taxAdvisorColumnId survives the strict settings parse (openspec client-tax-advisor)', () => {
  const parsed = parseClientSources({
    boards: [{ boardId: '1', crmLinkColumnId: 'crm', yearColumnId: 'year', taxAdvisorColumnId: 'people_1' }],
    sheets: [],
  });
  assert.equal(parsed.boards.length, 1);
  assert.equal(parsed.boards[0]!.taxAdvisorColumnId, 'people_1');
});
