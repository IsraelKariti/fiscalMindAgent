import type { MessageChannel } from '../api';
import { isOverdueStopped } from '../format';
import { ClientHeader } from '../components/ClientHeader';
import { WhatsAppCard } from '../components/WhatsAppCard';
import { ClientImportSettings } from '../components/ClientSourcesSettings';
import { DocumentsCard } from '../components/DocumentsCard';
import { FilesCard } from '../components/FilesCard';
import { StatTiles } from '../components/StatTiles';
import { Timeline } from '../components/Timeline';
import { DashboardCharts } from '../components/charts/DashboardCharts';
import type { AgentTypeUI } from './types';

const CHANNELS: readonly MessageChannel[] = ['email', 'whatsapp'];

/**
 * The annual-report assistant's workspace UI: the doc collector's four tabs,
 * except that clients are added with name + email only (simpleClientForm) —
 * the agent determines the document list itself by interviewing the client,
 * so the documents tab starts empty and fills up as the interview progresses.
 */
export const annualReportUI: AgentTypeUI = {
  agentType: 'annual_report_assistant',
  simpleClientForm: true,
  addClientLeadKey: 'addClientLeadAnnual',
  settingsPanel: () => <ClientImportSettings />,
  settingsPanelTabKey: 'settingsTabConnections',
  channels: CHANNELS,
  nameKey: 'agentAnnualReportName',
  descriptionKey: 'agentAnnualReportDesc',
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M9 12h6" />
      <path d="M9 16h4" />
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
            channels={CHANNELS}
            nextScheduled={ctx.nextScheduled}
            goalStatus={ctx.client.goal_status}
            paused={ctx.client.paused}
            overdueStopped={isOverdueStopped(ctx.client)}
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
            dueDate={ctx.client.agent_fields?.due_date ?? null}
            overdueStopped={isOverdueStopped(ctx.client)}
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
            titleKey="annualDocsTitle"
            emptyTextKey="annualDocsEmpty"
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
            withDueDate
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
