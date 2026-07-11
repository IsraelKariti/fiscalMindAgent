import { ClientHeader } from '../components/ClientHeader';
import { WhatsAppCard } from '../components/WhatsAppCard';
import { DocumentsCard } from '../components/DocumentsCard';
import { FilesCard } from '../components/FilesCard';
import { StatTiles } from '../components/StatTiles';
import { Timeline } from '../components/Timeline';
import { DashboardCharts } from '../components/charts/DashboardCharts';
import type { AgentTypeUI } from './types';

/** The document collector's workspace UI: the four tabs the app has always had. */
export const docCollectorUI: AgentTypeUI = {
  agentType: 'doc_collector',
  supportsBoardImport: true,
  nameKey: 'agentDocCollectorName',
  descriptionKey: 'agentDocCollectorDesc',
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="m9 15 2 2 4-4" />
    </svg>
  ),
  clientTabs: [
    {
      id: 'conversation',
      labelKey: 'tabConversation',
      render: (ctx) => (
        <div className="tab-pane tab-pane-fill" role="tabpanel">
          <Timeline
            emails={ctx.emails}
            nextScheduled={ctx.nextScheduled}
            goalStatus={ctx.client.goal_status}
            paused={ctx.client.paused}
            draftFailed={ctx.draftFailed}
            draftStale={ctx.draftStale}
            premiumLocked={ctx.premiumLocked}
            contactEmail={ctx.contactEmail}
            onRetryDraft={async () => {
              await ctx.api.retryDraft(ctx.client.id);
              // The server restamped the drafting state — refetch so the placeholder
              // swaps back to "drafting…" immediately.
              await ctx.load();
            }}
            onSendNow={async () => {
              await ctx.api.sendScheduledNow(ctx.client.id);
              // The SSE tick also fires, but refetch right away so the bubble reflects the send.
              await ctx.load();
            }}
            onTogglePause={async (paused) => {
              await ctx.api.setPaused(ctx.client.id, paused);
              // Pausing holds the schedule / resuming restores or redrafts it — refresh right away.
              await ctx.load();
            }}
          />
        </div>
      ),
    },
    {
      id: 'dashboard',
      labelKey: 'tabDashboard',
      render: (ctx) => (
        <div className="tab-pane tab-pane-dashboard" role="tabpanel">
          <StatTiles
            documents={ctx.documents}
            emails={ctx.emails}
            nextScheduled={ctx.nextScheduled}
            goalStatus={ctx.client.goal_status}
          />
          <DashboardCharts
            documents={ctx.documents}
            emails={ctx.emails}
            files={ctx.files}
            nextScheduled={ctx.nextScheduled}
          />
        </div>
      ),
    },
    {
      id: 'documents',
      labelKey: 'tabDocuments',
      render: (ctx) => (
        <div className="tab-pane panel-stack" role="tabpanel">
          <DocumentsCard
            clientId={ctx.client.id}
            documents={ctx.documents}
            onChanged={async () => {
              // A document change can flip goal_status and (re)schedule emails — refresh everything.
              await ctx.load();
              await ctx.onClientUpdated();
            }}
          />
          <FilesCard clientId={ctx.client.id} files={ctx.files} documents={ctx.documents} />
        </div>
      ),
    },
    {
      id: 'details',
      labelKey: 'tabDetails',
      render: (ctx) => (
        <div className="tab-pane panel-stack" role="tabpanel">
          <ClientHeader
            client={ctx.client}
            onSaved={async (updated) => {
              ctx.setClient(updated);
              await ctx.onClientUpdated();
            }}
          />
          <WhatsAppCard
            client={ctx.client}
            premiumLocked={ctx.premiumLocked}
            contactEmail={ctx.contactEmail}
            onSaved={async (updated) => {
              ctx.setClient(updated);
              // Toggling the channel re-plans the next message — refresh the schedule too.
              await ctx.load();
              await ctx.onClientUpdated();
            }}
          />
        </div>
      ),
    },
  ],
};
