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

export interface GmailAccountRow {
  id: string;
  user_id: string;
  email_address: string;
  refresh_token_enc: string;
  created_at: Date;
  updated_at: Date;
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
  gmail_thread_id: string | null;
  occupation: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
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
  gmail_message_id: string | null;
  gmail_thread_id: string | null;
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

export interface GmailSyncStateRow {
  mailbox_email: string;
  last_history_id: string;
  watch_expiration: Date | null;
  updated_at: Date;
}
