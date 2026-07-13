import type { MessageChannel } from '../api';
import { ClientHeader } from '../components/ClientHeader';
import { DebtCard } from '../components/DebtCard';
import { DebtCollectorSettings } from '../components/DebtCollectorSettings';
import { Timeline } from '../components/Timeline';
import type { AgentTypeUI } from './types';

// Email-only in v1: the collection flow (payment confirmations as replies and
// receipt attachments) is built around the mailbox.
const CHANNELS: readonly MessageChannel[] = ['email'];

/**
 * The debt collector's workspace surface: the shared conversation timeline, a
 * debt tab showing the agent's latest analysis snapshot (agent_fields.debt),
 * and details. Clients are added with name + email only (simpleClientForm) —
 * their financial data lives in the sheets/boards configured in the settings
 * panel, not in the workspace.
 */
export const debtCollectorUI: AgentTypeUI = {
  agentType: 'debt_collector',
  channels: CHANNELS,
  nameKey: 'agentDebtCollectorName',
  descriptionKey: 'agentDebtCollectorDesc',
  simpleClientForm: true,
  settingsPanel: () => <DebtCollectorSettings />,
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M14.5 9a2.5 2.5 0 0 0-2.5-1.5A2.5 2.5 0 0 0 9.5 10c0 3 5 1.5 5 4.5a2.5 2.5 0 0 1-2.5 2.5A2.5 2.5 0 0 1 9.5 15" />
      <path d="M12 6v1.5" />
      <path d="M12 16.5V18" />
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
            draftFailed={ctx.draftFailed}
            draftStale={ctx.draftStale}
            premiumLocked={ctx.premiumLocked}
            contactEmail={ctx.contactEmail}
            onRetryDraft={async () => {
              await ctx.api.retryDraft(ctx.client.id);
              await ctx.load();
            }}
            onSendNow={async () => {
              await ctx.api.sendScheduledNow(ctx.client.id);
              await ctx.load();
            }}
            onTogglePause={async (paused) => {
              await ctx.api.setPaused(ctx.client.id, paused);
              await ctx.load();
            }}
          />
        </div>
      ),
    },
    {
      id: 'debt',
      labelKey: 'tabDebt',
      render: (ctx) => (
        <div className="tab-pane panel-stack" role="tabpanel">
          <DebtCard client={ctx.client} />
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
        </div>
      ),
    },
  ],
};
