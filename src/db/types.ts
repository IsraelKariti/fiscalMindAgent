export type GoalStatus = 'pending' | 'complete';

export interface UserRow {
  id: string;
  google_sub: string;
  email: string;
  name: string | null;
  picture_url: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface AgentMailboxRow {
  id: string;
  user_id: string;
  local_part: string;
  email_address: string;
  created_at: Date;
}

/** Per-accountant WhatsApp sender number (E.164), assigned by an admin; mirrors agent_mailboxes. */
export interface WaSenderRow {
  id: string;
  user_id: string;
  phone_number: string;
  created_at: Date;
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

export type DocumentStatus = 'pending' | 'collected';

export interface ClientDocumentRow {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: DocumentStatus;
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
  created_at: Date;
}

export interface AppSettingRow {
  key: string;
  value: string;
  updated_at: Date;
}
