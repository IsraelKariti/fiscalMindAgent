import type { ReactNode } from 'react';
import type {
  Client,
  ClientDocument,
  DocumentFile,
  Email,
  MessageChannel,
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
  /** The client's required-documents checklist. */
  documents: ClientDocument[];
  /** Files received over the channels (channel-level, agent-agnostic). */
  files: DocumentFile[];
  /** Refetch everything ClientView loads. */
  load: () => Promise<void>;
  /** Notify the shell (sidebar list, dashboard) that the client changed. */
  onClientUpdated: () => Promise<void>;
  setClient: (client: Client) => void;
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
   * When set, the settingsPanel renders in its own tab of the Settings view
   * (labeled by this key) instead of inline below the general sections.
   */
  settingsPanelTabKey?: MessageStringKey;
  /**
   * Clients come only from the configured import sources (monday boards /
   * Google Sheets) — the shell hides the manual add-client button and shows an
   * import-oriented empty state instead. Used by manual-kickoff agents
   * (declaration of capital), whose whole flow lives on the monday board.
   */
  importOnlyClients?: boolean;
  /**
   * The channels this agent type communicates over. Drives every
   * channel-conditional surface: single-channel agents get no channel filter
   * in the Timeline (pass this to its `channels` prop) and no per-message
   * channel badges, and agents without 'email' have no mailbox to show in
   * the workspace Settings view.
   */
  channels: readonly MessageChannel[];
}
