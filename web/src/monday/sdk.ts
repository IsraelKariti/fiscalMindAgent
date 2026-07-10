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

/** Seamless GraphQL call against the monday API, with the signed-in user's permissions. */
export async function mondayGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = (await monday.api(query, variables ? { variables } : undefined)) as { data?: T; errors?: unknown };
  if (!res.data) throw new Error('monday API call failed');
  return res.data;
}
