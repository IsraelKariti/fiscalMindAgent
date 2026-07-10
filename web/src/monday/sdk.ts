import mondaySdk from 'monday-sdk-js';

/**
 * The monday client SDK. It only works while this document runs inside a
 * monday.com iframe (dashboard widget); every call talks to the parent frame.
 */
export const monday = mondaySdk();

/**
 * Short-lived JWT that proves the monday account/user behind the iframe,
 * signed by monday with the app's client secret. Fetched fresh per request —
 * the tokens expire within minutes, so caching one is a bug factory.
 */
export async function getSessionToken(): Promise<string> {
  const res = (await monday.get('sessionToken')) as { data: string };
  return res.data;
}

export interface MondayContext {
  /** Boards connected to the dashboard this widget sits on. */
  boardIds?: (number | string)[];
  theme?: string;
}

export async function getContext(): Promise<MondayContext> {
  const res = (await monday.get('context')) as { data: MondayContext };
  return res.data ?? {};
}

/**
 * Subscribe to context pushes from monday. Fires immediately with the current
 * context and again whenever it changes (e.g. the user connects a board to the
 * widget) — a one-time `get('context')` misses those later changes. Returns an
 * unsubscribe function.
 */
export function listenContext(callback: (ctx: MondayContext) => void): () => void {
  return monday.listen('context', (res) => callback((res.data as MondayContext) ?? {}));
}

/** Hebrew/Arabic-range strong RTL characters. */
const RTL_RE = /[\u0590-\u08FF]/;

/**
 * monday-native toast, shown by the parent frame over the dashboard. That
 * frame is LTR whenever the monday UI language is, which scrambles Hebrew
 * messages with embedded numbers — wrap them in an RTL isolate (U+2067/U+2069)
 * so they lay out right-to-left regardless of the toast's own direction.
 */
export function showToast(message: string, type: 'success' | 'error' | 'info' = 'success'): void {
  const isolated = RTL_RE.test(message) ? '\u2067' + message + '\u2069' : message;
  // A minute: long enough to read after looking away; the X dismisses earlier.
  void monday.execute('notice', { message: isolated, type, timeout: 60_000 });
}

/** Seamless GraphQL call against the monday API, with the signed-in user's permissions. */
export async function mondayGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = (await monday.api(query, variables ? { variables } : undefined)) as { data?: T; errors?: unknown };
  if (!res.data) throw new Error('monday API call failed');
  return res.data;
}
