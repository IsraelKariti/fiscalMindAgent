import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { dueDateFromWindow, startCollectionWindow } from '../src/agents/declarationOfCapital/collectionWindow.js';
import type { AgentInstanceRow, ClientRow } from '../src/db/types.js';

// openspec `collection-window`: at first contact the client's due date becomes
// the local delivery date plus the instance's window, unless a date is set.

const TZ = 'Asia/Jerusalem';

test('counts from the local date, not the UTC date', () => {
  // 23:30 Israel time on 2026-11-03 is 21:30 UTC the same day; 00:30 Israel
  // time on 2026-11-04 is still 22:30 UTC on the 3rd.
  assert.equal(dueDateFromWindow(new Date('2026-11-03T21:30:00Z'), 14, TZ), '2026-11-17');
  assert.equal(dueDateFromWindow(new Date('2026-11-03T22:30:00Z'), 14, TZ), '2026-11-18');
});

test('adds the window across a month end and a year end', () => {
  assert.equal(dueDateFromWindow(new Date('2026-11-25T10:00:00Z'), 14, TZ), '2026-12-09');
  assert.equal(dueDateFromWindow(new Date('2026-12-25T10:00:00Z'), 14, TZ), '2027-01-08');
  assert.equal(dueDateFromWindow(new Date('2026-11-03T10:00:00Z'), 21, TZ), '2026-11-24');
});

function client(fields: Record<string, unknown>): ClientRow {
  return { id: 'c1', agent_fields: fields } as unknown as ClientRow;
}
const instance = { id: 'i1', collection_window_days: 14 } as unknown as AgentInstanceRow;

test('a hand-set due date is left untouched', async () => {
  const writes: string[] = [];
  const result = await startCollectionWindow(client({ due_date: '2026-12-31' }), instance, new Date(), {
    setDueDateIfAbsent: async (_id, d) => {
      writes.push(d);
      return true;
    },
  });
  assert.equal(result, null);
  assert.deepEqual(writes, []);
});

test('a client without a due date gets delivery date plus the window', async () => {
  const writes: string[] = [];
  const result = await startCollectionWindow(client({}), instance, new Date('2026-11-03T21:30:00Z'), {
    setDueDateIfAbsent: async (_id, d) => {
      writes.push(d);
      return true;
    },
  });
  assert.equal(writes.length, 1);
  assert.equal(result, writes[0]);
  // Whatever the machine's ACCOUNTANT_TIMEZONE, the stamp is 14 days after the local date.
  assert.match(result!, /^\d{4}-\d{2}-\d{2}$/);
});

test('a lost race (row already stamped) writes nothing', async () => {
  const result = await startCollectionWindow(client({}), instance, new Date(), {
    setDueDateIfAbsent: async () => false,
  });
  assert.equal(result, null);
});

test('no instance means no window', async () => {
  let called = false;
  const result = await startCollectionWindow(client({}), null, new Date(), {
    setDueDateIfAbsent: async () => {
      called = true;
      return true;
    },
  });
  assert.equal(result, null);
  assert.equal(called, false);
});
