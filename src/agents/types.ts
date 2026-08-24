import type { Router } from 'express';
import type { AgentInstanceRow, ClientRow, DocumentFileRow, MessageChannel, UserRow } from '../db/types.js';

/**
 * How an agent type converses with clients:
 * - 'scheduled_follow_up': plan → draft → delayed send (collectors); inbound
 *   messages cancel the pending send and trigger a re-plan.
 * - 'immediate_reply': inbound → plan → send now (support agents).
 * - 'none': no client conversations (periodic/calculation agents).
 */
export type ConversationModel = 'scheduled_follow_up' | 'immediate_reply' | 'none';

/** Everything a hook needs to act for one client of one agent instance. */
export interface AgentContext {
  /** NULL only for legacy CLI-era clients that predate agent_instances (treated as doc_collector). */
  instance: AgentInstanceRow | null;
  client: ClientRow;
  accountant: UserRow | null;
}

/** A stored inbound message and/or newly ingested files, ready for the agent's reaction. */
export interface InboundEvent {
  channel: MessageChannel;
  /** The stored message row id; null when the row could not be (re)loaded. */
  messageRowId: string | null;
  /** False on duplicate provider redeliveries (the reaction then only matters if files were backfilled). */
  isNewMessage: boolean;
  newFileCount: number;
}

/**
 * One agent type, defined in code (src/agents/<type>/) and registered in
 * registry.ts. Which accountant has which type enabled lives in the
 * agent_instances table.
 */
export interface AgentTypeDefinition {
  /** Registry id, matches agent_instances.agent_type. */
  id: string;
  conversationModel: ConversationModel;
  /**
   * Local-part suffix of this type's per-instance sender address
   * (<accountant-prefix>-<suffix>@AGENT_EMAIL_DOMAIN). Only agent types that
   * email clients set it. Lowercase letters/digits only, and no suffix may be
   * a trailing substring of another — derived addresses across types must
   * stay distinct while accountant prefixes are unique.
   */
  emailSuffix?: string;
  /**
   * The agent's work is scoped to one tax year (agent_instances.tax_year,
   * admin-set in the activation modal; unset = the last concluded year). The
   * agent must surface that year to clients and use it when fetching documents
   * from external sites that hold multiple years.
   */
  collectsTaxYear?: boolean;
  /**
   * The agent never contacts a client on its own initiative: imported clients
   * are created paused with no first draft, and outreach starts only on an
   * explicit accountant trigger — the monday kickoff webhook
   * (src/webhook/mondayKickoffRoute.ts) or the workspace resume toggle.
   */
  manualKickoff?: boolean;
  /**
   * WhatsApp is this agent's ONLY client channel: clients are keyed by phone
   * number (import sources map a phone column instead of an email column, the
   * kickoff webhook resolves rows by phone, email_address is a synthetic
   * placeholder), the planner may never choose the email channel, and no
   * sender mailbox is required. Requires a wa_senders number for the instance;
   * first contact outside the 24h window needs an approved template.
   */
  whatsappOnly?: boolean;
  /**
   * Fixed-catalog checklist seeding (declaration of capital): every new client
   * of this type starts with exactly these rows as 'unresolved' — the intake
   * interview resolves them — regardless of enrollment path. When set,
   * per-client imported checklists don't apply: the import source's documents
   * column is ignored and enrollment never blocks on it.
   */
  seedClientDocuments?(taxYear: number): { typeKey: string; name: string; description: string | null }[];
  /**
   * One planning step for one client — decide, act on goal state, and (for
   * conversational agents) schedule the next message. Runs inside
   * setFutureEmail's drafting-state wrapper (paused/complete guards, drafting
   * stamps, failure recording).
   */
  planNextAction(ctx: AgentContext): Promise<void>;
  /** Reaction to a stored inbound message, after attachment/media ingestion. */
  onInboundMessage(ctx: AgentContext, evt: InboundEvent): Promise<void>;
  /**
   * Content analysis for a stored inbound file (owns setAnalysis + billing).
   * Undefined = the agent doesn't analyze files; rows are marked unsupported.
   */
  analyzeInboundFile?(ctx: AgentContext, file: DocumentFileRow, body: Buffer): Promise<void>;
  /**
   * Agent-type-specific API routes (e.g. the doc collector's required-documents
   * CRUD), composed into the agent-scoped workspace router. Handlers see
   * req.agentInstance and must skip (next('router')) when it isn't their type.
   */
  buildRouter?(): Router;
}
