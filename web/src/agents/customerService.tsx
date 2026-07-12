import { ClientHeader } from '../components/ClientHeader';
import { CustomerServiceSettings } from '../components/CustomerServiceSettings';
import { Timeline } from '../components/Timeline';
import { WhatsAppCard } from '../components/WhatsAppCard';
import type { AgentTypeUI } from './types';

/**
 * The customer-service agent's workspace surface: an inbound-only WhatsApp
 * Q&A agent, so the conversation tab mutes all scheduling UI (goal-less,
 * nothing is ever scheduled) and the agent-level settings section configures
 * the monday knowledge sources.
 */
export const customerServiceUI: AgentTypeUI = {
  agentType: 'customer_service',
  inboundOnlyClients: true,
  whatsAppOnly: true,
  nameKey: 'agentCustomerServiceName',
  descriptionKey: 'agentCustomerServiceDesc',
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 11h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5Z" />
      <path d="M21 11h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-5Z" />
      <path d="M3 11v-1a9 9 0 0 1 18 0v1" />
      <path d="M21 16v1a3 3 0 0 1-3 3h-4" />
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
            nextScheduled={null}
            // Goal-less agent: "complete" + hidden footer mutes every
            // scheduling/drafting placeholder the Timeline can render.
            goalStatus="complete"
            hideStatusFooter
            paused={false}
            draftFailed={false}
            draftStale={false}
            premiumLocked={ctx.premiumLocked}
            contactEmail={ctx.contactEmail}
            onRetryDraft={async () => {}}
            onSendNow={async () => {}}
            onTogglePause={async () => {}}
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
  settingsPanel: () => <CustomerServiceSettings />,
};
