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

export type EmailDirection = 'inbound' | 'outbound';
export type EmailStatus = 'draft' | 'sent' | 'received';

export interface EmailRow {
  id: string;
  client_id: string;
  direction: EmailDirection;
  status: EmailStatus;
  /** RFC 5322 Message-ID — inbound dedupe key and In-Reply-To/References source. */
  message_id: string | null;
  /** Resend's id for the email (send response / inbound email_id). */
  resend_id: string | null;
  subject: string;
  body: string;
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
