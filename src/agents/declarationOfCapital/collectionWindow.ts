import * as clients from '../../db/queries/clients.js';
import { env } from '../../config/env.js';
import { logger } from '../../util/logger.js';
import type { AgentInstanceRow, ClientRow } from '../../db/types.js';
import { clientDueDate } from './prompt.js';

/**
 * The collection window (openspec `collection-window`): the accountant wants
 * the chase to last a fixed number of days per agent
 * (agent_instances.collection_window_days, admin-set, default 14). At first
 * contact — the agent's first delivered message — the client's collection due
 * date becomes the local delivery date plus the window, unless the accountant
 * already set a date by hand. From there the ordinary due-date machinery
 * takes over: the planner paces reminders toward it and the overdue scan
 * stops the chase the night after it passes.
 */

/** "YYYY-MM-DD" of `at` in the given timezone (en-CA formats ISO-style). */
function localDate(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(at);
}

/**
 * The due date for a message delivered at `sentAt`: its local date in the
 * accountant's timezone plus `days`. The arithmetic runs on the date parts in
 * UTC so daylight-saving changes inside the window cannot shift the day.
 */
export function dueDateFromWindow(sentAt: Date, days: number, timeZone: string = env.ACCOUNTANT_TIMEZONE): string {
  const [y, m, d] = localDate(sentAt, timeZone).split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export interface CollectionWindowDeps {
  setDueDateIfAbsent: (clientId: string, dueDate: string) => Promise<boolean>;
}

const defaultDeps: CollectionWindowDeps = { setDueDateIfAbsent: clients.setDueDateIfAbsent };

/**
 * First-contact junction (docs/pipeline.md): stamps the automatic due date
 * on a client that carries none. A hand-set date wins; the write is
 * conditional in SQL too, so a racing second call is a no-op. Returns the
 * stamped date, or null when nothing was written.
 */
export async function startCollectionWindow(
  client: ClientRow,
  instance: AgentInstanceRow | null,
  sentAt: Date,
  deps: CollectionWindowDeps = defaultDeps,
): Promise<string | null> {
  if (!instance) return null;
  if (clientDueDate(client)) return null;
  const dueDate = dueDateFromWindow(sentAt, instance.collection_window_days);
  const written = await deps.setDueDateIfAbsent(client.id, dueDate);
  if (!written) return null;
  logger.info('collection window started', { clientId: client.id, dueDate, days: instance.collection_window_days });
  return dueDate;
}
