import type { ReactNode } from 'react';
import type {
  AccountTier,
  Client,
  ClientDocument,
  DocumentFile,
  Email,
  NextScheduled,
  WorkspaceApi,
} from '../api';
import type { Messages } from '../i18n';

/** Everything a client tab needs, loaded and kept fresh by the generic ClientView. */
export interface ClientTabContext {
  api: WorkspaceApi;
  client: Client;
  emails: Email[];
  nextScheduled: NextScheduled | null;
  /** Doc-collector data; [] for agent types without required documents. */
  documents: ClientDocument[];
  /** Files received over the channels (channel-level, agent-agnostic). */
  files: DocumentFile[];
  /** Refetch everything ClientView loads. */
  load: () => Promise<void>;
  /** Notify the shell (sidebar list, dashboard) that the client changed. */
  onClientUpdated: () => Promise<void>;
  setClient: (client: Client) => void;
  premiumLocked: boolean;
  contactEmail: string | null;
  draftFailed: boolean;
  draftStale: boolean;
}

/** Message keys whose value is a plain string (tab labels can't take arguments). */
export type MessageStringKey = { [K in keyof Messages]: Messages[K] extends string ? K : never }[keyof Messages];

export interface ClientTab {
  id: string;
  labelKey: MessageStringKey;
  render: (ctx: ClientTabContext) => ReactNode;
}

/**
 * How one agent type renders in the workspace shell. The behavioral half of
 * an agent type lives server-side (src/agents/); this is only its UI shape.
 */
export interface AgentTypeUI {
  agentType: string;
  /** Type display name — instances carry their own (DB) name; this covers not-yet-enabled types. */
  nameKey: MessageStringKey;
  descriptionKey: MessageStringKey;
  icon: ReactNode;
  clientTabs: ClientTab[];
  /**
   * Optional agent-level settings panel, rendered as an extra section of the
   * workspace Settings view (inside WorkspaceApiProvider, so it may call
   * useWorkspaceApi() for agent-scoped requests).
   */
  settingsPanel?: () => ReactNode;
  /**
   * monday surfaces only: offers the board→clients import in this agent's
   * workspace. The import endpoint creates doc-collector clients (required
   * documents + first-email draft), so only the doc collector sets this;
   * other agents connect monday through their own settings panel instead.
   */
  supportsBoardImport?: boolean;
  /**
   * Clients enroll themselves (inbound-only agents: a WhatsApp sender becomes
   * a client on their first message). The shell hides the manual add-client
   * button — whose email + documents form is follow-up-agent shaped — and
   * shows an inbound-oriented empty state instead.
   */
  inboundOnlyClients?: boolean;
}
