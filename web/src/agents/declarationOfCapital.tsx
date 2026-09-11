import type { MessageChannel } from '../api';
import { isOverdueStopped } from '../format';
import { ClientHeader } from '../components/ClientHeader';
import { ClientImportSettings } from '../components/ClientSourcesSettings';
import { WhatsAppCard } from '../components/WhatsAppCard';
import { DocumentsCard } from '../components/DocumentsCard';
import { FilesCard } from '../components/FilesCard';
import { StatTiles } from '../components/StatTiles';
import { Timeline } from '../components/Timeline';
import { DashboardCharts } from '../components/charts/DashboardCharts';
import type { AgentTypeUI, ClientTab } from './types';

/** WhatsApp is the only client channel — no email surfaces anywhere. */
const CHANNELS: readonly MessageChannel[] = ['whatsapp'];

const clientTabs: ClientTab[] = [
  {
    id: 'conversation',
    labelKey: 'tabConversation',
    render: (ctx) => (
      <div className="tab-pane tab-pane-fill" role="tabpanel">
        <Timeline
          emails={ctx.emails}
          files={ctx.files}
          channels={CHANNELS}
          nextScheduled={ctx.nextScheduled}
          goalStatus={ctx.client.goal_status}
          paused={ctx.client.paused}
          overdueStopped={isOverdueStopped(ctx.client)}
          draftFailed={ctx.draftFailed}
          draftStale={ctx.draftStale}
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
          onRetrySend={async () => {
            await ctx.api.retrySend(ctx.client.id);
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
    render: (ctx) => {
      const fields = ctx.client.agent_fields ?? {};
      const attestation =
        typeof fields['attestation_confirmed_at'] === 'string'
          ? ('confirmed' as const)
          : typeof fields['attestation_request_email_id'] === 'string'
            ? ('requested' as const)
            : ('none' as const);
      return (
        <div className="tab-pane panel-stack" role="tabpanel">
          <DocumentsCard
            clientId={ctx.client.id}
            documents={ctx.documents}
            files={ctx.files}
            capital={{ attestation }}
            onChanged={async () => {
              // A document change can flip goal_status and (re)schedule messages — refresh everything.
              await ctx.load();
              await ctx.onClientUpdated();
            }}
          />
          <FilesCard clientId={ctx.client.id} files={ctx.files} documents={ctx.documents} />
        </div>
      );
    },
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
];

/**
 * The declaration-of-capital collector's workspace UI: conversation, dashboard,
 * the capital documents tab — status groups (intake בבירור → נדרש → באימות →
 * אומת), verification badges/reasons, the not-required quotes, and the
 * attestation state — and the client details. The server seeds every client's
 * checklist from the hardcoded catalog, and the whole flow lives on the monday
 * board (import sources + kickoff webhook), so there is no manual add-client
 * button. Clients are keyed by their phone column (phone-keyed source mapping).
 */
export const declarationOfCapitalUI: AgentTypeUI = {
  agentType: 'declaration_of_capital',
  importOnlyClients: true,
  channels: CHANNELS,
  // No portal-credential columns (ת"ז / user code): the declarations board
  // carries links, not identity — the ת"ז comes off the linked CRM card at
  // kickoff (agent_fields.id_number).
  settingsPanel: () => (
    <ClientImportSettings keyKind="phone" withStatusColumn withDeclarationColumns withSheets={false} withImportScan={false} />
  ),
  settingsPanelTabKey: 'settingsTabConnections',
  nameKey: 'agentDeclarationOfCapitalName',
  descriptionKey: 'agentDeclarationOfCapitalDesc',
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 8.5 4.5H3.5z" />
      <line x1="4" y1="21" x2="20" y2="21" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
    </svg>
  ),
  clientTabs,
};
