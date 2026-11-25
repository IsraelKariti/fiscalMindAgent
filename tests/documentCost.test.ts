import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { clientFigures, median, summarizeDocumentCost } from '../src/analytics/documentCost.js';
import type { ClientDocumentCostRow } from '../src/db/queries/documentCost.js';

// The admin documents tab's figures (openspec `document-cost-analytics`).

let seq = 0;
function row(over: Partial<ClientDocumentCostRow> = {}): ClientDocumentCostRow {
  seq += 1;
  return {
    id: `c${seq}`,
    name: `client ${seq}`,
    goal_status: 'pending',
    paused: false,
    deleted: false,
    is_test: false,
    declined: false,
    created_at: new Date('2026-10-01T10:00:00Z'),
    calls: 0,
    failed: 0,
    cost: 0,
    unpriced: 0,
    file_cost: 0,
    items_file: 0,
    items_form: 0,
    items_chat: 0,
    items_accountant: 0,
    items_open: 0,
    messages_sent: 0,
    messages_received: 0,
    first_message_at: null,
    last_message_at: null,
    ...over,
  };
}

const close = (a: number | null, b: number) => {
  assert.notEqual(a, null);
  assert.ok(Math.abs((a as number) - b) < 1e-9, `${a} ≠ ${b}`);
};

test('a client: both quotients from its total cost and its item groups', () => {
  const c = clientFigures(row({ cost: 1.2, items_file: 4, items_form: 1, items_chat: 1, items_open: 3 }));
  close(c.costPerFile, 0.3);
  close(c.costPerItem, 0.2);
  assert.equal(c.itemsSettled, 6);
  assert.equal(c.itemsOpen, 3);
});

test('a client: the three settled-without-file groups are kept apart and all count as settled', () => {
  const c = clientFigures(row({ cost: 2.2, items_file: 4, items_form: 3, items_chat: 3, items_accountant: 1, items_open: 2 }));
  assert.equal(c.itemsForm, 3);
  assert.equal(c.itemsChat, 3);
  assert.equal(c.itemsAccountant, 1);
  assert.equal(c.itemsSettled, 11);
  close(c.costPerItem, 0.2);
});

test('a client with nothing settled reads undefined quotients, never zero or infinity', () => {
  const c = clientFigures(row({ cost: 0.05 }));
  assert.equal(c.cost, 0.05);
  assert.equal(c.costPerFile, null);
  assert.equal(c.costPerItem, null);
});

test('state: declined wins, then completed, then paused, then running; deleted and test are badges', () => {
  assert.equal(clientFigures(row({ declined: true, goal_status: 'complete' })).state, 'declined');
  assert.equal(clientFigures(row({ goal_status: 'complete', paused: true })).state, 'completed');
  assert.equal(clientFigures(row({ paused: true })).state, 'paused');
  assert.equal(clientFigures(row()).state, 'running');
  const d = clientFigures(row({ deleted: true, is_test: true }));
  assert.equal(d.state, 'running');
  assert.equal(d.deleted, true);
  assert.equal(d.test, true);
});

test('days active: calendar days from the first to the last message', () => {
  const c = clientFigures(row({ first_message_at: new Date('2026-10-01T10:00:00Z'), last_message_at: new Date('2026-10-15T09:00:00Z') }));
  assert.equal(c.daysActive, 14);
  assert.equal(clientFigures(row()).daysActive, null);
});

test('median: middle value or the mean of the two middle values', () => {
  assert.equal(median([]), null);
  assert.equal(median([0.2, 1, 0.1]), 0.2);
  assert.equal(median([4, 1, 3, 2]), 2.5);
});

test('tiles: pooled averages, median per client and the completed figures', () => {
  const rows = [
    row({ cost: 1, items_file: 2, items_form: 1, items_chat: 1, goal_status: 'complete', first_message_at: new Date('2026-10-01T10:00:00Z'), last_message_at: new Date('2026-10-11T10:00:00Z') }),
    row({ cost: 3, items_file: 6, items_form: 2, goal_status: 'complete', first_message_at: new Date('2026-10-01T10:00:00Z'), last_message_at: new Date('2026-10-21T10:00:00Z') }),
    row({ cost: 2, items_file: 12, items_form: 3, items_chat: 2, items_accountant: 1, file_cost: 1.5, messages_sent: 10 }),
    row({ cost: 0.5 }),
  ];
  const s = summarizeDocumentCost(rows, { completedOnly: false });
  assert.equal(s.tiles.clients, 4);
  close(s.tiles.cost, 6.5);
  assert.equal(s.tiles.itemsFile, 20);
  assert.equal(s.tiles.itemsForm, 6);
  assert.equal(s.tiles.itemsChat, 3);
  assert.equal(s.tiles.itemsAccountant, 1);
  close(s.tiles.costPerFile, 6.5 / 20);
  close(s.tiles.costPerItem, 6.5 / 30);
  // per-client costPerItem: 0.25, 0.375, 2/18, undefined → median of the three defined = 0.25
  close(s.tiles.medianCostPerItem, 0.25);
  assert.equal(s.tiles.completed, 2);
  close(s.tiles.costPerCompleted, 2);
  close(s.tiles.fileShare, 1.5 / 6.5);
  close(s.tiles.messagesPerItem, 10 / 30);
  assert.equal(s.tiles.medianDaysCompleted, 15);
});

test('footer: sums of the counts and the pooled averages', () => {
  const s = summarizeDocumentCost(
    [row({ cost: 1, items_file: 2, items_form: 1, items_chat: 1 }), row({ cost: 3, items_file: 6, items_form: 1, items_chat: 1 })],
    { completedOnly: false },
  );
  assert.equal(s.footer.itemsFile, 8);
  assert.equal(s.footer.itemsForm, 2);
  assert.equal(s.footer.itemsChat, 2);
  assert.equal(s.footer.itemsAccountant, 0);
  assert.equal(s.footer.cost, 4);
  close(s.footer.costPerFile, 0.5);
  close(s.footer.costPerItem, 4 / 12);
});

test('empty instance: every quotient undefined, no clients', () => {
  const s = summarizeDocumentCost([], { completedOnly: false });
  assert.equal(s.tiles.clients, 0);
  assert.equal(s.tiles.costPerFile, null);
  assert.equal(s.tiles.costPerCompleted, null);
  assert.equal(s.tiles.fileShare, null);
  assert.equal(s.footer.costPerItem, null);
});

test('completed only keeps the clients whose goal is complete', () => {
  const s = summarizeDocumentCost(
    [row({ cost: 2, goal_status: 'complete' }), row({ cost: 3, goal_status: 'complete' }), row({ cost: 4, goal_status: 'complete' }), row({ cost: 9 })],
    { completedOnly: true },
  );
  assert.equal(s.tiles.clients, 3);
  assert.equal(s.tiles.cost, 9);
  close(s.tiles.costPerCompleted, 3);
  assert.equal(s.clients.length, 3);
});

test('clients come sorted by total cost descending; unpriced counts propagate', () => {
  const s = summarizeDocumentCost([row({ cost: 0.1 }), row({ cost: 0.5, unpriced: 1 }), row({ cost: 0.3 })], { completedOnly: false });
  assert.deepEqual(
    s.clients.map((c) => c.cost),
    [0.5, 0.3, 0.1],
  );
  assert.equal(s.tiles.unpriced, 1);
  assert.equal(s.footer.unpriced, 1);
  assert.equal(s.clients[0]!.unpriced, 1);
});
