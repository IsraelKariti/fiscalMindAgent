import type { MessageChannel } from '../api';
import { ClientImportSettings } from '../components/ClientSourcesSettings';
import { DocumentsCard } from '../components/DocumentsCard';
import { FilesCard } from '../components/FilesCard';
import { docCollectorClientTabs, docCollectorUI } from './docCollector';
import type { AgentTypeUI } from './types';

const CHANNELS: readonly MessageChannel[] = ['whatsapp'];

/**
 * The declaration-of-capital collector's workspace UI: the doc collector's
 * tabs, with the documents tab swapped to the capital flow — status groups
 * (intake בבירור → נדרש → באימות → אומת), verification badges/reasons, the
 * not-required quotes, and the attestation state. The add-client checklist is
 * gone: the server seeds every client from the hardcoded catalog. The agent is
 * WhatsApp-only: clients are keyed by their phone column (phone-keyed source
 * mapping, no documents column) and no email surfaces anywhere.
 */
export const declarationOfCapitalUI: AgentTypeUI = {
  ...docCollectorUI,
  agentType: 'declaration_of_capital',
  supportsBoardImport: false,
  // The whole flow lives on the monday board (import sources + kickoff
  // webhook) — no manual add-client button.
  importOnlyClients: true,
  channels: CHANNELS,
  settingsPanel: () => <ClientImportSettings keyKind="phone" withPortalCredentials withStatusColumn withDeclarationColumns />,
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
  clientTabs: docCollectorClientTabs(CHANNELS).map((tab) =>
    tab.id !== 'documents'
      ? tab
      : {
          ...tab,
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
                    // A document change can flip goal_status and (re)schedule emails — refresh everything.
                    await ctx.load();
                    await ctx.onClientUpdated();
                  }}
                />
                <FilesCard clientId={ctx.client.id} files={ctx.files} documents={ctx.documents} />
              </div>
            );
          },
        },
  ),
};
