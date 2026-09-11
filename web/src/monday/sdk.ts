import mondaySdk from 'monday-sdk-js';

/**
 * The monday client SDK. It only works while this document runs inside a
 * monday.com iframe (the custom object); every call talks to the parent frame.
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

/** Hebrew/Arabic-range strong RTL characters. */
const RTL_RE = /[\u0590-\u08FF]/;

/**
 * monday-native toast, shown by the parent frame over the workspace. That
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
