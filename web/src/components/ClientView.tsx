import { useCallback, useEffect, useState } from 'react';
import { api, type Client, type ClientDocument, type DocumentFile, type Email, type NextScheduled } from '../api';
import { ClientHeader } from './ClientHeader';
import { DocumentsCard } from './DocumentsCard';
import { FilesCard } from './FilesCard';
import { StatTiles } from './StatTiles';
import { Timeline } from './Timeline';
import { DashboardCharts } from './charts/DashboardCharts';

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'documents', label: 'Documents' },
  { id: 'conversation', label: 'Conversation' },
  { id: 'details', label: 'Details' },
] as const;

type TabId = (typeof TABS)[number]['id'];

export function ClientView({ clientId, onClientUpdated }: { clientId: string; onClientUpdated: () => Promise<void> }) {
  const [client, setClient] = useState<Client | null>(null);
  const [nextScheduled, setNextScheduled] = useState<NextScheduled | null>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Stored per client (App keys this component on clientId) so a refresh — or
  // switching away and back — returns to the tab last viewed for this client.
  const tabStorageKey = `fm.clientTab.${clientId}`;
  const [activeTab, setActiveTab] = useState<TabId>(() => {
    const stored = sessionStorage.getItem(tabStorageKey);
    return TABS.some((t) => t.id === stored) ? (stored as TabId) : 'dashboard';
  });

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    sessionStorage.setItem(tabStorageKey, tab);
  };

  const load = useCallback(async () => {
    try {
      const [detail, thread, received] = await Promise.all([
        api.getClient(clientId),
        api.listEmails(clientId),
        api.listFiles(clientId),
      ]);
      setClient(detail.client);
      setNextScheduled(detail.nextScheduled);
      setDocuments(detail.documents);
      setEmails(thread.emails);
      setFiles(received.files);
      setError(null);
    } catch {
      setError('Failed to load client.');
    }
  }, [clientId]);

  // Keep the timeline current while the user watches: refetch every 15s when
  // the tab is visible, and immediately when it becomes visible again.
  useEffect(() => {
    load();
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    const interval = setInterval(refreshIfVisible, 15_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!client) return <div className="muted">Loading…</div>;

  return (
    <div className="client-view dashboard">
      <div className="client-tabs" role="tablist" aria-label="Client sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`client-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {activeTab === 'dashboard' && (
        <div className="tab-pane tab-pane-dashboard" role="tabpanel">
          <StatTiles
            documents={documents}
            emails={emails}
            nextScheduled={nextScheduled}
            goalStatus={client.goal_status}
          />
          <DashboardCharts documents={documents} emails={emails} files={files} nextScheduled={nextScheduled} />
        </div>
      )}
      {activeTab === 'documents' && (
        <div className="tab-pane panel-stack" role="tabpanel">
          <DocumentsCard
            clientId={client.id}
            documents={documents}
            onChanged={async () => {
              // A document change can flip goal_status and (re)schedule emails — refresh everything.
              await load();
              await onClientUpdated();
            }}
          />
          <FilesCard clientId={client.id} files={files} documents={documents} />
        </div>
      )}
      {activeTab === 'conversation' && (
        <div className="tab-pane tab-pane-fill" role="tabpanel">
          <Timeline emails={emails} nextScheduled={nextScheduled} goalStatus={client.goal_status} />
        </div>
      )}
      {activeTab === 'details' && (
        <div className="tab-pane" role="tabpanel">
          <ClientHeader
            client={client}
            onSaved={async (updated) => {
              setClient(updated);
              await onClientUpdated();
            }}
          />
        </div>
      )}
    </div>
  );
}
