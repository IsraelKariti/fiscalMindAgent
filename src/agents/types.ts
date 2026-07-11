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
}
