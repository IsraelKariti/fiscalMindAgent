export type GoalStatus = 'pending' | 'complete';

/**
 * One enabled agent (of a code-defined type, src/agents/registry.ts) for one
 * accountant. Each instance owns its own client list.
 */
export interface AgentInstanceRow {
  id: string;
  user_id: string;
  /** Registry id, e.g. 'declaration_of_capital'; validated in code, not the DB. */
  agent_type: string;
  name: string;
  enabled: boolean;
  /** Per-instance config (cron pattern, prompt override, …) — shape owned by the agent type. */
  settings: Record<string, unknown>;
  /** The tax year documents are collected for (admin-set; NULL = default to the last concluded year). */
  tax_year: number | null;
  /** Admin-owned pilot supervision (048): outbound messages need admin approval. Only effective on declaration_of_capital. */
  review_mode: boolean;
  /** Admin-owned emergency brake (048): silently stops planning + sending for all this instance's clients. Only effective on declaration_of_capital. Invisible to the accountant. */
  admin_paused: boolean;
  /** Blob key of the instance's own WhatsApp picture (061, src/storage/logos.ts); NULL = app logo / built-in default. */
  logo_blob_key: string | null;
  /** Days the agent chases a client after first contact (070, openspec `collection-window`): stamps the client's due date at first delivery. Admin-set, default 14. */
  collection_window_days: number;
  /** Manual-kickoff instances only (073, openspec `first-message-approval`): true = clients enroll paused and the first message is held for the accountant's Resume; false = clients enroll running and the first message is queued for its planned time. Admin-set, default true. */
  first_message_approval: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface UserRow {
  id: string;
  /** NULL on invited rows (admin-created at activation, before first Google sign-in). */
  google_sub: string | null;
  email: string;
  name: string | null;
  /**
   * Admin-entered Hebrew name of the accountant/firm (whitelisted_emails.hebrew_name,
   * migration 040). Only populated by users.getById's whitelist join — rows coming
   * from `RETURNING *` don't carry it. Agents prefer it over the Google-synced name.
   */
  hebrew_name?: string | null;
  picture_url: string | null;
  /** DB-managed admin flag (migration 033) — the only thing that grants admin access. */
  is_admin: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface AgentMailboxRow {
  id: string;
  user_id: string;
  /** NULL = the accountant's claimed account mailbox; set = a derived per-agent-instance sender address. */
  agent_instance_id: string | null;
  local_part: string;
  email_address: string;
  created_at: Date;
}

/** Per-agent-instance WhatsApp sender number (E.164), assigned by an admin. */
export interface WaSenderRow {
  id: string;
  agent_instance_id: string;
  phone_number: string;
  /** Display name submitted at purchase (migration 065); NULL for a hand-assigned number. */
  display_name: string | null;
  created_at: Date;
}

/** Per-accountant WhatsApp Business Account (WABA), connected in Settings → Integrations. */
export interface WaBusinessAccountRow {
  user_id: string;
  waba_id: string;
  source: 'embedded_signup' | 'manual';
  connected_at: Date;
}

/** Pre-approved Twilio Content Template (utility category). */
export interface WaTemplateRow {
  id: string;
  /** Twilio Content SID (HX...). */
  content_sid: string;
  name: string;
  /** Template text with {{1}}..{{n}} variable slots, as approved by Meta. */
  body: string;
  variable_count: number;
  /** Agent type this template is offered to; NULL = every agent type. */
  agent_type: string | null;
  /** `intro` = first contact only (no message ever delivered); `reopen` = a later closed-window contact. */
  purpose: WaTemplatePurpose;
  created_at: Date;
}

export type WaTemplatePurpose = 'intro' | 'reopen';

export interface UserSettingRow {
  user_id: string;
  key: string;
  value: string;
  updated_at: Date;
}

export interface ClientRow {
  id: string;
  /** NULL only on legacy rows created via the CLI before multi-tenancy. */
  user_id: string | null;
  /** NULL only on the same legacy CLI rows; no agent acts for them. */
  agent_instance_id: string | null;
  /** Per-agent scalar fields (e.g. debt amount) — shape owned by the agent type's Zod schema. */
  agent_fields: Record<string, unknown>;
  name: string;
  email_address: string;
  goal_status: GoalStatus;
  occupation: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  /** Validated E.164 number used for WhatsApp routing (`phone` stays free text). */
  wa_phone: string | null;
  wa_enabled: boolean;
  wa_opted_in_at: Date | null;
  wa_opted_in_by: string | null;
  wa_opted_out_at: Date | null;
  /** True while the accountant has paused the agent's outreach to this client. */
  paused: boolean;
  /** Admin-owned emergency brake (048), separate from the accountant-visible `paused`. Only effective on declaration_of_capital clients. Never serialized to the workspace. */
  admin_paused: boolean;
  /** Set while a planning attempt (setFutureEmail) is in flight; stale = attempt died mid-flight. */
  drafting_since: Date | null;
  /** Set when the last planning attempt threw; the UI shows a Retry button. */
  draft_failed_at: Date | null;
  /** Held by a model-provider outage (079, openspec `llm-provider-outage`): a message, file or planner run of this client waits for the provider; the workspace shows "waiting for the system". Cleared by the recovery. */
  outage_held_at: Date | null;
  /** The provider the hold waits for (gemini | openai | anthropic | budget); set with outage_held_at. */
  outage_held_provider: string | null;
  /** The one calm acknowledgement sent to the client during this hold (079); cleared with outage_held_at. */
  outage_ack_sent_at: Date | null;
  /** Soft delete (migration 063): set when the client was deleted; the row and all its data stay. NULL = live. */
  deleted_at: Date | null;
  /** The user who deleted the client (the admin while viewing as); NULL when live or the user is gone. */
  deleted_by: string | null;
  /** Admin test client (migration 067, openspec `admin-test-client`): hidden from every accountant-facing roster; only the admin's view-as lists it. */
  is_test: boolean;
  created_at: Date;
  updated_at: Date;
}

/**
 * Ad-hoc rows use pending/claimed/collected. The capital-declaration
 * intake (migration 047) adds the rest: 'unresolved' = catalog-seeded, the
 * intake interview hasn't determined applicability yet; 'not_required' = the
 * client explicitly stated the asset doesn't apply (evidence on the row);
 * 'claimed' = the client says they delivered it outside email (fax/in person)
 * or that the office already holds it, awaits the accountant's confirmation;
 * 'approved' = the automatic verification pipeline accepted the received file
 * (never set by hand); 'stated' (migration 062, openspec `chat-stated-cost`)
 * = a cost declaration the client stated in the conversation — settled like
 * 'approved' but with no file, the evidence on the row; 'retired' (migration
 * 050) = the requirements ladder replaced this document with different ones —
 * out of the goal, but never presented as "the client doesn't have the asset".
 */
export type DocumentStatus =
  | 'unresolved'
  | 'not_required'
  | 'pending'
  | 'claimed'
  | 'collected'
  | 'approved'
  | 'stated'
  | 'retired';

/**
 * The client statement an intake resolution rests on: a verbatim quote from a
 * stored inbound message (the WhatsApp interview), or — for rows pre-resolved
 * from the client's submitted intake questionnaire — the form question the
 * quoted answer belongs to.
 */
export type ResolutionEvidence =
  | { message_id: string; quote: string }
  | { source: 'form'; question: string; quote: string }
  // A questionnaire question the client left empty — "I don't have this".
  | { source: 'form_empty'; question: string }
  // A row the per-company / per-employer split made for a file tied to an
  // item (openspec `unlisted-files`): the file, the issuer printed on it as
  // the classifier reported it (audit only — never used as a name) and, for
  // an employer row, the cleaned employer the row is named after.
  | { source: 'file'; file_id: string; issuer: string; employer?: string }
  // An approved property paper whose proven seller kind called for the
  // change (openspec `real-estate-goal-driven-clarification`): the verified
  // file, the row it was approved for, and the fact (a private seller retires
  // the appendix; a builder seller adds it).
  | { source: 'approved_file'; file_id: string; document_id: string; fact: 'seller_private' | 'seller_builder' }
  // A self-evident file the planner cited instead of a quote (openspec
  // `unlisted-files`): a report of a known institution in the client's or
  // spouse's name that created its own item — the file, the issuer as
  // printed, the matched holders, whom they matched, and the cleaned employer.
  | { source: 'self_evident_file'; file_id: string; issuer: string; holders: string[]; matched: 'client' | 'spouse'; employer?: string }
  // A cost the client stated in the conversation (openspec `chat-stated-cost`):
  // the inbound message, the verbatim quote that carries the amount, and the
  // amount with its currency code — the content of the cost declaration.
  | { source: 'chat'; message_id: string; quote: string; amount: number; currency: string }
  // The client's own statement about a vehicle (openspec `vehicle-declaration`):
  // every inbound message it rests on (the item may be stated over several
  // turns) and the facts merged from them — any subset; an absent fact is unknown.
  | { source: 'chat_vehicle'; statements: { message_id: string; quote: string }[]; facts: VehicleFacts };

/** The facts of a vehicle declaration the client stated; a missing key = not stated. Currency rides with the cost. */
export interface VehicleFacts {
  manufacturer?: string;
  model?: string;
  production_year?: number;
  license_plate?: string;
  purchase_cost?: number;
  currency?: string;
}

export interface ClientDocumentRow {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: DocumentStatus;
  /** Catalog type this row instantiates (declarationOfCapital/catalog.ts); NULL = ad-hoc (accountant-added) row. */
  type_key: string | null;
  /** The paper of the type this row stands for (openspec `document-papers`, migration 060); NULL = no paper (type without papers, ad-hoc or older row). */
  paper_key: string | null;
  /** Latest verification-pipeline verdict (extracted fields + per-check results); NULL until a file is verified. */
  verification: Record<string, unknown> | null;
  /** Evidence behind an agent-made 'not_required' resolution; NULL otherwise. */
  resolution_evidence: ResolutionEvidence | null;
  /**
   * What replaced a retired row (migration 075, openspec `retired-by-declaration-tab`):
   * other documents, or the client's own declaration (a statable paper of the
   * row's type added or stated in the same planner answer). NULL = retired
   * before the column existed, or not retired. Read only on 'retired' rows.
   */
  replaced_by: RetirementReplacement | null;
  created_at: Date;
  updated_at: Date;
}

/** What replaced a retired checklist row (migration 075). */
export type RetirementReplacement = 'documents' | 'client_declaration';

/** 'blocked' (054): the injection screen flagged the file before classification — quarantined, never analyzed. */
/** 'not_needed': the platform fetched the file itself and linked it — content analysis does not apply (057). */
/** 'split' (058): the parent of a file cut into one child per document — never classified, never evidence, never linked. */
export type FileAnalysisStatus = 'pending' | 'done' | 'failed' | 'unsupported' | 'blocked' | 'not_needed' | 'split';

/** What the injection screen found on a withheld message / blocked file (054). */
export interface InjectionBlock {
  detector: 'regex' | 'llm';
  /** The regex pattern that fired; null for the LLM scan. */
  kind: string | null;
  evidence: string | null;
}

/** Gemini's verdict from reading the file's actual contents (FileAnalysisSchema in gemini/analyzeFile.ts). */
export interface FileAnalysis {
  document_kind: string;
  summary: string;
  tax_year: string | null;
  subject_name: string | null;
  /** The company that issued the document, as printed (capital-declaration files; absent on older rows). */
  issuer_name?: string | null;
  matched_document_id: string | null;
  /** Why validate_classification dropped the model's match (company check); absent when nothing was dropped. */
  match_dropped?: string | null;
  legible: boolean;
  confidence: 'high' | 'medium' | 'low';
  /** The analyzer saw instruction-like text addressed at an AI inside the file; absent on rows analyzed before this field existed. */
  injection_suspected?: boolean;
  /** Capital-declaration files only: closed classification (a catalog type key or 'other'), cross-checked against the matched row's type. */
  document_type?: string;
  /** Capital-declaration files only: the paper of the file from its type's closed list (openspec `document-papers`); null = none; absent on older rows. */
  document_paper?: string | null;
  /**
   * The accounts, funds or policies the file shows, as printed (files of an
   * institution-bound type; absent on rows analyzed before the field existed).
   * holder_name null = no readable name on the file.
   */
  holdings?: { product: string; holder_name: string | null; account_number: string | null }[];
  /** The file shows more entries than the list holds. */
  holdings_partial?: boolean;
  /**
   * The employer printed on a fund report (files of an employer-bound type —
   * study fund, pension/provident; absent on rows analyzed before the field
   * existed). File text: read through cleanEmployer (splitChildNames.ts) only.
   */
  employer_name?: string | null;
}

/** A file received from the client; bytes live in Azure Blob Storage under blob_key. */
export interface DocumentFileRow {
  id: string;
  client_id: string;
  email_id: string | null;
  client_document_id: string | null;
  provider_attachment_id: string;
  blob_key: string;
  filename: string;
  /** Display label when the filename isn't descriptive (e.g. "טופס 106 — <employer>" for tax-fetched forms). */
  label: string | null;
  content_type: string;
  size_bytes: string; // BIGINT comes back from pg as a string
  sha256: string;
  analysis_status: FileAnalysisStatus;
  analysis: FileAnalysis | null;
  /** Set with analysis_status 'blocked' (054). */
  blocked: InjectionBlock | null;
  /** Held by a provider outage (079): the analysis stopped before a verdict, analysis_status stays 'pending'; cleared when the analysis runs again. */
  outage_held_at: Date | null;
  /** Set on a child cut out of a multi-document PDF (058): the file it came from and its 1-based, inclusive page range. */
  parent_file_id: string | null;
  page_from: number | null;
  page_to: number | null;
  analyzed_at: Date | null;
  created_at: Date;
}

export type EmailDirection = 'inbound' | 'outbound';
/** 'held' (048): the send time arrived while the draft awaited admin review; parked, sends on approval. */
export type EmailStatus = 'draft' | 'held' | 'sent' | 'received';
export type MessageChannel = 'email' | 'whatsapp';

/**
 * Admin review lifecycle of an outbound draft (048). NULL = not subject to
 * review; 'pending' = awaits the admin; 'approved' = the worker may send it;
 * 'superseded' = a replan discarded it while it was still pending.
 */
export type ReviewStatus = 'pending' | 'approved' | 'superseded';

/**
 * What started the planning cycle that wrote an outbound draft (076, openspec
 * `discarded-message-analytics`). Every setFutureEmail caller names one.
 */
export type PlanTrigger =
  | 'client_message'
  | 'agent_message_sent'
  | 'file_verification'
  | 'tax_fetch'
  | 'kickoff'
  | 'team_answer'
  | 'admin_redraft'
  | 'review_regenerate'
  | 'admin_unpause'
  | 'resume'
  | 'goal_reopened'
  | 'channel_changed';

/**
 * Why a pending draft was cancelled without being sent (076). Every
 * removeFutureEmail caller names one; 'unknown' = backfilled before 076.
 */
export type DiscardReason =
  | 'client_message'
  | 'file_verification'
  | 'tax_fetch'
  | 'admin_redraft'
  | 'admin_pause'
  | 'resume'
  | 'client_declined'
  | 'goal_changed'
  | 'channel_changed'
  | 'client_deleted'
  | 'send_settled'
  | 'review_regenerate'
  | 'unknown';

export interface EmailRow {
  id: string;
  client_id: string;
  direction: EmailDirection;
  status: EmailStatus;
  channel: MessageChannel;
  /** RFC 5322 Message-ID (email) or Twilio MessageSid (whatsapp) — dedupe key. */
  message_id: string | null;
  /** Resend's id for the email (send response / inbound email_id); NULL on whatsapp rows. */
  resend_id: string | null;
  /** Always '' on whatsapp rows. */
  subject: string;
  body: string;
  /** Twilio Content SID when this is a WhatsApp template message (sent outside the 24h window). */
  wa_content_sid: string | null;
  /** Variable values for {{1}}..{{n}} of wa_content_sid. */
  wa_content_variables: string[] | null;
  /** LLM's internal explanation for the follow-up decision (send time etc.); outbound drafts only. */
  reasoning: string | null;
  /** Admin review lifecycle (048); NULL on everything outside review mode. */
  review_status: ReviewStatus | null;
  /** When the worker parked this draft unapproved at its send time (048). */
  held_at: Date | null;
  /** Inbound only (054): the injection screen withheld this message from the planner. */
  blocked: InjectionBlock | null;
  /** Inbound only (079): the injection screen could not run (provider held); the text reaches no model until it is screened. */
  screen_pending: boolean;
  /** Outbound drafts (076): what started the cycle that wrote it; NULL on inbound rows. */
  plan_trigger: PlanTrigger | null;
  /** Outbound drafts (076): the planned send time, kept after the scheduled_jobs mirror row is deleted. */
  scheduled_for: Date | null;
  /** Outbound drafts (076): stamped by removeFutureEmail when the pending draft is cancelled unsent. */
  discarded_at: Date | null;
  discard_reason: DiscardReason | null;
  /** Outbound drafts (076): the planning cycle id shared with the cycle's llm_calls rows; NULL before 076. */
  plan_run_id: string | null;
  sent_at: Date | null;
  created_at: Date;
}

export interface ScheduledJobRow {
  client_id: string;
  bullmq_job_id: string;
  scheduled_for: Date;
  /** The job ran and its send threw — the draft is kept for a manual retry. */
  send_failed_at: Date | null;
  created_at: Date;
}

export interface AppSettingRow {
  key: string;
  value: string;
  updated_at: Date;
}

/**
 * One employee an accountant lets into their workspace read-only (migration
 * 068, openspec `accountant-employee-access`). `email` is stored lower-cased
 * and is unique across all accountants.
 */
export interface AccountantStaffRow {
  id: string;
  accountant_user_id: string;
  email: string;
  created_by: string | null;
  created_at: Date;
}

/** How a team question was closed (openspec `team-questions`): an answer for the agent to relay, or the team member already spoke to the client. */
export type TeamQuestionClosedHow = 'answered' | 'handled_outside';

/**
 * A question the agent asked the client's team member (migration 068,
 * openspec `team-questions`). `closed_*` are null while the question is open;
 * `closed_text` is the answer (required) or the note of a question handled
 * outside the app (optional).
 */
export interface TeamQuestionRow {
  id: string;
  client_id: string;
  agent_instance_id: string;
  question: string;
  reason: string;
  /** The inbound message (emails.id) the question rests on; null when none. */
  evidence_message_id: string | null;
  asked_at: Date;
  to_email: string;
  to_name: string;
  /** Who the addressee is to the accountant: the accountant themself, or a staff entry. */
  to_match: 'accountant' | 'staff';
  closed_how: TeamQuestionClosedHow | null;
  closed_text: string | null;
  closed_at: Date | null;
  closed_by: string | null;
  closed_by_name: string | null;
  created_at: Date;
}
