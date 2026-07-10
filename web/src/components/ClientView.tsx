import { useCallback, useEffect, useState } from 'react';
import { api, type AccountTier, type Client, type ClientDocument, type DocumentFile, type Email, type NextScheduled } from '../api';
import { ClientHeader } from './ClientHeader';
import { WhatsAppCard } from './WhatsAppCard';
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

export function ClientView({
  clientId,
  onClientUpdated,
  tier,
  contactEmail,
}: {
  clientId: string;
  onClientUpdated: () => Promise<void>;
  tier: AccountTier | null;
  contactEmail: string | null;
}) {
  const { t } = useT();
  // WhatsApp is premium-only. Null tier means an admin workspace — never locked.
  const premiumLocked = tier === 'normal';
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
    // The URL comes from the api transport: cookie-authenticated /api in the
    // SPA, token-in-query /api/monday/app in the monday iframe (EventSource
    // cannot send headers).
    let events: EventSource | null = null;
    let cancelled = false;
    api.eventsUrl(clientId).then((url) => {
      if (cancelled) return;
      events = new EventSource(url);
      events.onmessage = () => load();
    });
    return () => {
      cancelled = true;
      events?.close();
    };
  }, [clientId, load]);

  // Goal open with nothing scheduled means the agent is drafting the next email in the
  // background (e.g. right after client creation) — poll fast so it pops in when ready.
  // Not while paused: paused clients have nothing scheduled by design.
  const drafting = client !== null && client.goal_status === 'pending' && !client.paused && !nextScheduled;

  // Drafting normally settles within ~2 minutes (one Gemini call, worst case a few
  // internal retries), so past this it isn't "still thinking" — the attempt is gone.
  const DRAFT_STALE_MS = 3 * 60_000;
  // Observed failure: the planning attempt threw and recorded it.
  const draftFailed = drafting && client?.draft_failed_at != null;
  // Abandoned attempt: a crash/restart killed the draft without recording anything.
  // drafting_since is authoritative; rows from before it existed (or the rare kill
  // between cancel and re-plan) fall back to the last timeline activity.
  const lastEmail = emails[emails.length - 1];
  const draftAnchor = client?.drafting_since ?? lastEmail?.sent_at ?? lastEmail?.created_at ?? client?.created_at;
  const draftStale =
    drafting && !draftFailed && draftAnchor !== undefined && Date.now() - new Date(draftAnchor).getTime() > DRAFT_STALE_MS;

  // Fallback polling in case the event stream drops: refetch every 15s when
  // the tab is visible, and immediately when it becomes visible again.
  useEffect(() => {
    load();
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') load();
    };
    // No fast poll once drafting failed/stalled — nothing changes until the user retries.
    const interval = setInterval(refreshIfVisible, drafting && !draftFailed && !draftStale ? 3_000 : 15_000);
    document.addEventListener('visibilitychange', refreshIfVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfVisible);
    };
  }, [load, drafting, draftFailed, draftStale]);

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
          <Timeline
            emails={emails}
            nextScheduled={nextScheduled}
            goalStatus={client.goal_status}
            paused={client.paused}
            draftFailed={draftFailed}
            draftStale={draftStale}
            premiumLocked={premiumLocked}
            contactEmail={contactEmail}
            onRetryDraft={async () => {
              await api.retryDraft(clientId);
              // The server restamped the drafting state — refetch so the placeholder
              // swaps back to "drafting…" immediately.
              await load();
            }}
            onSendNow={async () => {
              await api.sendScheduledNow(clientId);
              // The SSE tick also fires, but refetch right away so the bubble reflects the send.
              await load();
            }}
            onTogglePause={async (paused) => {
              await api.setPaused(clientId, paused);
              // Pausing holds the schedule / resuming restores or redrafts it — refresh right away.
              await load();
            }}
          />
        </div>
      )}
      {activeTab === 'details' && (
        <div className="tab-pane panel-stack" role="tabpanel">
          <ClientHeader
            client={client}
            onSaved={async (updated) => {
              setClient(updated);
              await onClientUpdated();
            }}
          />
          <WhatsAppCard
            client={client}
            premiumLocked={premiumLocked}
            contactEmail={contactEmail}
            onSaved={async (updated) => {
              setClient(updated);
              // Toggling the channel re-plans the next message — refresh the schedule too.
              await load();
              await onClientUpdated();
            }}
          />
        </div>
      )}
    </div>
  );
}
