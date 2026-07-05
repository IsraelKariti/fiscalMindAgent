import { useCallback, useEffect, useState } from 'react';
import { api, type Client, type ClientDocument, type DocumentFile, type Email, type NextScheduled } from '../api';
import { ClientHeader } from './ClientHeader';
import { DocumentsCard } from './DocumentsCard';
import { FilesCard } from './FilesCard';
import { StatTiles } from './StatTiles';
import { Timeline } from './Timeline';
import { DashboardCharts } from './charts/DashboardCharts';
import { useT, type Messages } from '../i18n';

const TABS = [
  { id: 'conversation', labelKey: 'tabConversation' },
  { id: 'dashboard', labelKey: 'tabDashboard' },
  { id: 'documents', labelKey: 'tabDocuments' },
  { id: 'details', labelKey: 'tabDetails' },
] as const satisfies readonly { id: string; labelKey: keyof Messages }[];

type TabId = (typeof TABS)[number]['id'];

// Per-client last-viewed tab, in memory only: switching between clients
// restores each client's tab, but a page load always starts on Conversation.
const lastViewedTab = new Map<string, TabId>();

export function ClientView({ clientId, onClientUpdated }: { clientId: string; onClientUpdated: () => Promise<void> }) {
  const { t } = useT();
  const [client, setClient] = useState<Client | null>(null);
  const [nextScheduled, setNextScheduled] = useState<NextScheduled | null>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>(() => lastViewedTab.get(clientId) ?? 'conversation');

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    lastViewedTab.set(clientId, tab);
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
      setError(t.clientLoadFailed);
    }
  }, [clientId, t]);

  // Server-pushed refresh: the API streams a tick whenever this client's state changes
  // (reply stored, scheduled email canceled for redrafting, new draft scheduled, goal
  // completed), so the timeline updates the moment it happens — e.g. the old scheduled
  // email swaps to the "drafting…" placeholder as soon as the agent starts replacing it.
  useEffect(() => {
    const events = new EventSource(`/api/clients/${clientId}/events`);
    events.onmessage = () => load();
    return () => events.close();
  }, [clientId, load]);

  // Goal open with nothing scheduled means the agent is drafting the next email in the
  // background (e.g. right after client creation) — poll fast so it pops in when ready.
  const drafting = client !== null && client.goal_status === 'pending' && !nextScheduled;

  // Fallback polling in case the event stream drops: refetch every 15s when
  // the tab is visible, and immediately when it becomes visible again.
  useEffect(() => {
    load();
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    const interval = setInterval(refreshIfVisible, drafting ? 3_000 : 15_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load, drafting]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!client) return <div className="muted">{t.loading}</div>;

  return (
    <div className="client-view dashboard">
      <div className="client-tabs" role="tablist" aria-label={t.clientSectionsAria}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`client-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => selectTab(tab.id)}
          >
            {t[tab.labelKey]}
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
