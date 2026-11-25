import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { readStoredFilters, sortClients, STORAGE_KEY } from '../web/src/components/documentCost.js';
import type { DocumentCostClient } from '../web/src/api.js';

// openspec `split-not-required-by-source`: the admin documents tab's sort keys after the conversation column split.

function client(over: Partial<DocumentCostClient>): DocumentCostClient {
  return {
    clientId: 'c',
    name: 'c',
    state: 'running',
    deleted: false,
    test: false,
    itemsFile: 0,
    itemsForm: 0,
    itemsChat: 0,
    itemsAccountant: 0,
    itemsOpen: 0,
    itemsSettled: 0,
    messagesSent: 0,
    messagesReceived: 0,
    calls: 0,
    failed: 0,
    cost: 0,
    unpriced: 0,
    fileCost: 0,
    costPerFile: null,
    costPerItem: null,
    daysActive: null,
    ...over,
  };
}

test('sort by items closed in the chat: descending, ties keep the given (cost) order', () => {
  const rows = [client({ clientId: 'a', itemsChat: 1 }), client({ clientId: 'b', itemsChat: 3 }), client({ clientId: 'c', itemsChat: 1 })];
  assert.deepEqual(sortClients(rows, 'itemsChat').map((c) => c.clientId), ['b', 'a', 'c']);
  assert.deepEqual(sortClients(rows, 'itemsForm').map((c) => c.clientId), ['a', 'b', 'c']);
});

test('a remembered sort of the retired combined column falls back to total cost', () => {
  const store = new Map<string, string>([[STORAGE_KEY, JSON.stringify({ clients: 'all', completed: true, sort: 'itemsConversation' })]]);
  (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null };
  try {
    assert.deepEqual(readStoredFilters(), { clients: 'all', completed: true, sort: 'cost' });
  } finally {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
});
