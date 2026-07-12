import type { MessageChannel } from '../api';
import { ClientHeader } from '../components/ClientHeader';
import { WhatsAppCard } from '../components/WhatsAppCard';
import { Timeline } from '../components/Timeline';
import type { AgentTypeUI } from './types';

const CHANNELS: readonly MessageChannel[] = ['email', 'whatsapp'];

/**
 * STUB — the workspace surface for the (not yet implemented) debt collector.
 * No documents/dashboard tabs: this agent has no required-documents concept,
 * which is exactly what the per-agent-type tab registry exists to express.
 */
export const debtCollectorUI: AgentTypeUI = {
  agentType: 'debt_collector',
  channels: CHANNELS,
  nameKey: 'agentDebtCollectorName',
  descriptionKey: 'agentDebtCollectorDesc',
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
              await ctx.load();
              await ctx.onClientUpdated();
            }}
          />
        </div>
      ),
    },
  ],
};
