import { useCallback, useEffect, useState } from 'react';
import type { Client, ClientDocument, DocumentFile, Email, NextScheduled } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { AgentTypeUI, ClientTabContext } from '../agents/types';
import { useT } from '../i18n';

// Per-client last-viewed tab, in memory only: switching between clients
// restores each client's tab, but a page load always starts on Conversation.
const lastViewedTab = new Map<string, string>();

/**
 * The generic per-client view: loads the client + conversation, keeps them
 * fresh (SSE + fallback polling), tracks the drafting placeholder state, and
 * renders the active agent type's tabs around that shared context.
 */
export function ClientView({
  clientId,
  agentUI,
  onClientUpdated,
}: {
  clientId: string;
  agentUI: AgentTypeUI;
  onClientUpdated: () => Promise<void>;
}) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [client, setClient] = useState<Client | null>(null);
  const [nextScheduled, setNextScheduled] = useState<NextScheduled | null>(null);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [emails, setEmails] = useState<Email[]>([]);
  const [files, setFiles] = useState<DocumentFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const tabs = agentUI.clientTabs;
  const [activeTab, setActiveTab] = useState<string>(() => {
    const stored = lastViewedTab.get(clientId);
    return stored && tabs.some((tab) => tab.id === stored) ? stored : (tabs[0]?.id ?? '');
  });

  const selectTab = (tab: string) => {
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
    } catch (err) {
      // Surface the underlying cause — "failed" alone is undebuggable across
      // the three surfaces (SPA, widget, monday object) this view runs in.
      console.error('client load failed', err);
      const detail = err instanceof Error ? err.message : String(err);
      setError(`${t.clientLoadFailed} [${detail}]`);
    }
  }, [api, clientId, t]);

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
  }, [api, clientId, load]);

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

  const ctx: ClientTabContext = {
    api,
    client,
    emails,
    nextScheduled,
    documents,
    files,
    load,
    onClientUpdated,
    setClient,
    draftFailed,
    draftStale,
  };

  return (
    <div className="client-view dashboard">
      {tabs.length > 1 && (
        <div className="client-tabs" role="tablist" aria-label={t.clientSectionsAria}>
          {tabs.map((tab) => (
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
      )}
      {tabs.find((tab) => tab.id === activeTab)?.render(ctx)}
    </div>
  );
}
