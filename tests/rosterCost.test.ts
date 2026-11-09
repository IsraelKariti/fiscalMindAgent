import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { attachRosterCost } from '../src/api/workspaceSerialize.js';

// Admin roster cost (openspec `admin-roster-cost`): the client list carries a
// per-client lifetime LLM spend only for an admin's view-as session.
describe('attachRosterCost', () => {
  const rows = [
    { id: 'a', name: 'A' },
    { id: 'b', name: 'B' },
  ];

  it('adds the summed cost under view-as, 0 for a client with no calls', () => {
    const out = attachRosterCost(rows, new Map([['a', 0.0142]]));
    assert.deepEqual(out, [
      { id: 'a', name: 'A', cost: 0.0142 },
      { id: 'b', name: 'B', cost: 0 },
    ]);
  });

  it('leaves the rows untouched, with no cost key, outside view-as', () => {
    const out = attachRosterCost(rows, null);
    assert.deepEqual(out, rows);
    for (const row of out) assert.equal('cost' in row, false);
  });
});
