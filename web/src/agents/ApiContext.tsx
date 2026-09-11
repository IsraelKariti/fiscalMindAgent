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
