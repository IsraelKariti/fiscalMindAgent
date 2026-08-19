export type GoalStatus = 'pending' | 'complete';

/**
 * One enabled agent (of a code-defined type, src/agents/registry.ts) for one
 * accountant. Each instance owns its own client list.
 */
export interface AgentInstanceRow {
  id: string;
  user_id: string;
  /** Registry id, e.g. 'doc_collector'; validated in code, not the DB. */
  agent_type: string;
  name: string;
  enabled: boolean;
  /** Per-instance config (cron pattern, prompt override, …) — shape owned by the agent type. */
  settings: Record<string, unknown>;
  /** The tax year documents are collected for (admin-set; NULL = default to the last concluded year). */
  tax_year: number | null;
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
  created_at: Date;
}

/** Per-accountant WhatsApp Business Account (WABA), connected in Settings → Integrations. */
export interface WaBusinessAccountRow {
  user_id: string;
  waba_id: string;
  source: 'embedded_signup' | 'manual';
  connected_at: Date;
}

/** Pre-approved Twilio Content Template (utility category), platform-global. */
export interface WaTemplateRow {
  id: string;
  /** Twilio Content SID (HX...). */
  content_sid: string;
  name: string;
  /** Template text with {{1}}..{{n}} variable slots, as approved by Meta. */
  body: string;
  variable_count: number;
  created_at: Date;
}

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
  /** NULL only on the same legacy CLI rows; runtime falls back to doc_collector. */
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
  /** Set while a planning attempt (setFutureEmail) is in flight; stale = attempt died mid-flight. */
  drafting_since: Date | null;
  /** Set when the last planning attempt threw; the UI shows a Retry button. */
  draft_failed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/**
 * Doc-collector rows use pending/claimed/collected. The capital-declaration
 * intake (migration 047) adds the rest: 'unresolved' = catalog-seeded, the
 * intake interview hasn't determined applicability yet; 'not_required' = the
 * client explicitly stated the asset doesn't apply (evidence on the row);
 * 'claimed' = the client says they delivered it outside email (fax/in person),
 * awaits the accountant's confirmation; 'approved' = the automatic
 * verification pipeline accepted the received file (never set by hand).
 */
export type DocumentStatus = 'unresolved' | 'not_required' | 'pending' | 'claimed' | 'collected' | 'approved';

/** The client statement an intake resolution rests on — verbatim quote from a stored inbound message. */
export interface ResolutionEvidence {
  message_id: string;
  quote: string;
}

export interface ClientDocumentRow {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: DocumentStatus;
  /** Catalog type this row instantiates (declarationOfCapital/catalog.ts); NULL = doc-collector or ad-hoc row. */
  type_key: string | null;
  /** Latest verification-pipeline verdict (extracted fields + per-check results); NULL until a file is verified. */
  verification: Record<string, unknown> | null;
  /** Evidence behind an agent-made 'not_required' resolution; NULL otherwise. */
  resolution_evidence: ResolutionEvidence | null;
  created_at: Date;
  updated_at: Date;
}

export type FileAnalysisStatus = 'pending' | 'done' | 'failed' | 'unsupported';

/** Gemini's verdict from reading the file's actual contents (FileAnalysisSchema in gemini/analyzeFile.ts). */
export interface FileAnalysis {
  document_kind: string;
  summary: string;
  tax_year: string | null;
  subject_name: string | null;
  matched_document_id: string | null;
  legible: boolean;
  confidence: 'high' | 'medium' | 'low';
  /** The analyzer saw instruction-like text addressed at an AI inside the file; absent on rows analyzed before this field existed. */
  injection_suspected?: boolean;
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
  analyzed_at: Date | null;
  created_at: Date;
}

export type EmailDirection = 'inbound' | 'outbound';
export type EmailStatus = 'draft' | 'sent' | 'received';
export type MessageChannel = 'email' | 'whatsapp';

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
