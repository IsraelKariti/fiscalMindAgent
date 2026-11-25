import type { ClientDocumentCostRow } from '../db/queries/documentCost.js';

/**
 * The admin documents tab's figures (openspec `document-cost-analytics`):
 * what the agent's LLM spend bought in settled checklist items, per client
 * and across one agent instance — the numbers the product is priced on.
 * Pure: the route loads the per-client sums (db/queries/documentCost.ts)
 * and calls `summarizeDocumentCost`.
 *
 * Every quotient is `null` when its divisor is zero — the UI prints `—`,
 * never 0 or Infinity. Costs are the recorded costs; unpriced calls count
 * as zero and are counted in `unpriced` so the UI can add a `+`.
 */

/** The one state the row shows; `deleted` and `test` ride as separate badges. */
export type ClientState = 'completed' | 'running' | 'paused' | 'declined';

export interface ClientFigures {
  clientId: string;
  name: string;
  state: ClientState;
  deleted: boolean;
  test: boolean;
  itemsFile: number;
  /** not_required rows the intake questionnaire settled. */
  itemsForm: number;
  /** Items the client's words in the chat settled: stated, claimed, not_required with a chat quote. */
  itemsChat: number;
  /** not_required rows the accountant marked by hand. */
  itemsAccountant: number;
  itemsOpen: number;
  /** itemsFile + itemsForm + itemsChat + itemsAccountant. */
  itemsSettled: number;
  messagesSent: number;
  messagesReceived: number;
  calls: number;
  failed: number;
  cost: number;
  unpriced: number;
  fileCost: number;
  /** cost ÷ itemsFile; null when no document with a file. */
  costPerFile: number | null;
  /** cost ÷ itemsSettled; null when nothing is settled. */
  costPerItem: number | null;
  /** Calendar days from the first to the last sent/received message; null without messages. */
  daysActive: number | null;
}

export interface Tiles {
  clients: number;
  cost: number;
  unpriced: number;
  itemsFile: number;
  itemsForm: number;
  itemsChat: number;
  itemsAccountant: number;
  itemsOpen: number;
  /** Pooled: total cost ÷ total documents with a file. */
  costPerFile: number | null;
  /** Pooled: total cost ÷ total settled items. */
  costPerItem: number | null;
  /** Median of the per-client costPerItem over clients whose value is defined. */
  medianCostPerItem: number | null;
  /** Mean lifetime cost of the clients whose goal is complete. */
  costPerCompleted: number | null;
  completed: number;
  /** File-tied cost ÷ total cost, 0..1; null when the total is zero. */
  fileShare: number | null;
  /** Agent messages sent ÷ settled items (pooled). */
  messagesPerItem: number | null;
  /** Median days from first to last message over completed clients with messages. */
  medianDaysCompleted: number | null;
}

export interface Footer {
  itemsFile: number;
  itemsForm: number;
  itemsChat: number;
  itemsAccountant: number;
  itemsOpen: number;
  messagesSent: number;
  messagesReceived: number;
  cost: number;
  unpriced: number;
  costPerFile: number | null;
  costPerItem: number | null;
}

export interface DocumentCostSummary {
  clients: ClientFigures[];
  tiles: Tiles;
  footer: Footer;
}

const DAY_MS = 86_400_000;

function ratio(numerator: number, divisor: number): number | null {
  return divisor > 0 ? numerator / divisor : null;
}

/** Standard median: the middle value, or the mean of the two middle values; null for no values. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** deleted is a badge, not a state; the state answers "where is the declaration". */
export function clientState(row: Pick<ClientDocumentCostRow, 'goal_status' | 'paused' | 'declined'>): ClientState {
  if (row.declined) return 'declined';
  if (row.goal_status === 'complete') return 'completed';
  if (row.paused) return 'paused';
  return 'running';
}

export function clientFigures(row: ClientDocumentCostRow): ClientFigures {
  const itemsSettled = row.items_file + row.items_form + row.items_chat + row.items_accountant;
  const daysActive =
    row.first_message_at && row.last_message_at
      ? Math.round((row.last_message_at.getTime() - row.first_message_at.getTime()) / DAY_MS)
      : null;
  return {
    clientId: row.id,
    name: row.name,
    state: clientState(row),
    deleted: row.deleted,
    test: row.is_test,
    itemsFile: row.items_file,
    itemsForm: row.items_form,
    itemsChat: row.items_chat,
    itemsAccountant: row.items_accountant,
    itemsOpen: row.items_open,
    itemsSettled,
    messagesSent: row.messages_sent,
    messagesReceived: row.messages_received,
    calls: row.calls,
    failed: row.failed,
    cost: row.cost,
    unpriced: row.unpriced,
    fileCost: row.file_cost,
    costPerFile: ratio(row.cost, row.items_file),
    costPerItem: ratio(row.cost, itemsSettled),
    daysActive,
  };
}

export function summarizeDocumentCost(
  rows: readonly ClientDocumentCostRow[],
  options: { completedOnly: boolean },
): DocumentCostSummary {
  const all = rows.map(clientFigures);
  const clients = options.completedOnly ? all.filter((c) => c.state === 'completed') : all;
  const sum = (pick: (c: ClientFigures) => number) => clients.reduce((acc, c) => acc + pick(c), 0);
  const itemsFile = sum((c) => c.itemsFile);
  const itemsForm = sum((c) => c.itemsForm);
  const itemsChat = sum((c) => c.itemsChat);
  const itemsAccountant = sum((c) => c.itemsAccountant);
  const itemsOpen = sum((c) => c.itemsOpen);
  const itemsSettled = itemsFile + itemsForm + itemsChat + itemsAccountant;
  const cost = sum((c) => c.cost);
  const unpriced = sum((c) => c.unpriced);
  const fileCost = sum((c) => c.fileCost);
  const messagesSent = sum((c) => c.messagesSent);
  const messagesReceived = sum((c) => c.messagesReceived);
  const completed = clients.filter((c) => c.state === 'completed');
  const costPerFile = ratio(cost, itemsFile);
  const costPerItem = ratio(cost, itemsSettled);
  return {
    clients: [...clients].sort((a, b) => b.cost - a.cost),
    tiles: {
      clients: clients.length,
      cost,
      unpriced,
      itemsFile,
      itemsForm,
      itemsChat,
      itemsAccountant,
      itemsOpen,
      costPerFile,
      costPerItem,
      medianCostPerItem: median(clients.map((c) => c.costPerItem).filter((v): v is number => v !== null)),
      costPerCompleted: ratio(
        completed.reduce((acc, c) => acc + c.cost, 0),
        completed.length,
      ),
      completed: completed.length,
      fileShare: ratio(fileCost, cost),
      messagesPerItem: ratio(messagesSent, itemsSettled),
      medianDaysCompleted: median(completed.map((c) => c.daysActive).filter((v): v is number => v !== null)),
    },
    footer: { itemsFile, itemsForm, itemsChat, itemsAccountant, itemsOpen, messagesSent, messagesReceived, cost, unpriced, costPerFile, costPerItem },
  };
}
