import { createContext, useContext } from 'react';
import type { WorkspaceApi } from '../api';

/** The agent-scoped workspace API for the surrounding agent workspace (provided by Workspace). */
const WorkspaceApiContext = createContext<WorkspaceApi | null>(null);

export const WorkspaceApiProvider = WorkspaceApiContext.Provider;

export function useWorkspaceApi(): WorkspaceApi {
  const api = useContext(WorkspaceApiContext);
  if (!api) throw new Error('useWorkspaceApi must be used inside a WorkspaceApiProvider');
  return api;
}

/**
 * Refreshes the surrounding workspace's client list (the sidebar). Settings
 * panels that enroll clients (client-import "import now") call this so new
 * clients appear without a page reload. No-op outside a provider.
 */
const ClientsRefreshContext = createContext<() => void>(() => {});

export const ClientsRefreshProvider = ClientsRefreshContext.Provider;

export function useClientsRefresh(): () => void {
  return useContext(ClientsRefreshContext);
}

/**
 * Who is looking at the workspace. `isAdmin` is true only for an admin
 * impersonating an accountant (standalone shell); the accountant's own session
 * — and the monday embed — never set it. It only reveals admin-only UI (the
 * LLM trace in the conversation); the data behind it is served by admin-gated
 * endpoints, so a forged flag shows an empty, failing toggle and nothing else.
 */
const ViewerContext = createContext<{ isAdmin: boolean }>({ isAdmin: false });

export const ViewerProvider = ViewerContext.Provider;

export function useViewer(): { isAdmin: boolean } {
  return useContext(ViewerContext);
}
