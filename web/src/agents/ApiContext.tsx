import { createContext, useContext } from 'react';
import { api, type WorkspaceApi } from '../api';

/**
 * The agent-scoped workspace API for the surrounding agent workspace.
 * Defaults to the legacy unprefixed api (server resolves the doc_collector
 * instance) so components rendered outside a provider keep working.
 */
const WorkspaceApiContext = createContext<WorkspaceApi>(api);

export const WorkspaceApiProvider = WorkspaceApiContext.Provider;

export function useWorkspaceApi(): WorkspaceApi {
  return useContext(WorkspaceApiContext);
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
