export type GoalStatus = 'pending' | 'complete';

export interface Client {
  id: string;
  name: string;
  email_address: string;
  goal_status: GoalStatus;
  occupation: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  /** Validated E.164 number used for WhatsApp (the free-text `phone` field is unrelated). */
  wa_phone: string | null;
  wa_enabled: boolean;
  wa_opted_in_at: string | null;
  wa_opted_out_at: string | null;
  created_at: string;
  updated_at: string;
}

export type DocumentStatus = 'pending' | 'collected';

export interface ClientDocument {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: DocumentStatus;
  created_at: string;
  updated_at: string;
}

export type FileAnalysisStatus = 'pending' | 'done' | 'failed' | 'unsupported';

/** Gemini's verdict from reading the file's actual contents at ingestion. */
export interface FileAnalysis {
  document_kind: string;
  summary: string;
  tax_year: string | null;
  subject_name: string | null;
  matched_document_id: string | null;
  legible: boolean;
  confidence: 'high' | 'medium' | 'low';
}

export interface DocumentFile {
  id: string;
  client_id: string;
  email_id: string | null;
  client_document_id: string | null;
  filename: string;
  content_type: string;
  size_bytes: string;
  analysis_status: FileAnalysisStatus;
  analysis: FileAnalysis | null;
  analyzed_at: string | null;
  created_at: string;
}

export type MessageChannel = 'email' | 'whatsapp';

export interface Email {
  id: string;
  client_id: string;
  direction: 'inbound' | 'outbound';
  status: 'draft' | 'sent' | 'received';
  channel: MessageChannel;
  /** Always '' on whatsapp messages. */
  subject: string;
  body: string;
  /** LLM's internal explanation for the follow-up decision (send time etc.); outbound only. */
  reasoning: string | null;
  sent_at: string | null;
  created_at: string;
}

export interface NextScheduled {
  scheduledFor: string;
  channel: MessageChannel;
  subject: string | null;
  body: string | null;
  reasoning: string | null;
}

/** One client with everything the workspace dashboard shows about it, pre-aggregated server-side. */
export interface DashboardClientSummary {
  id: string;
  name: string;
  email_address: string;
  goal_status: GoalStatus;
  created_at: string;
  docs_total: number;
  docs_collected: number;
  emails_sent: number;
  emails_received: number;
  last_inbound_at: string | null;
  next_scheduled_for: string | null;
}

export interface DashboardSummary {
  clients: DashboardClientSummary[];
  /** Delivered emails in the recent-activity window, for the weekly chart. */
  activity: { at: string; direction: 'inbound' | 'outbound' }[];
  filesTotal: number;
}

export interface PromptTemplateState {
  template: string;
  isCustom: boolean;
  updatedAt: string | null;
  defaultTemplate: string;
  placeholders: string[];
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? `Request failed (${res.status})`);
  return data as T;
}

export interface Me {
  authenticated: boolean;
  user?: { id: string; email: string; name: string | null; pictureUrl: string | null };
  isAdmin?: boolean;
  /** Whether this account may use the app (admins are always true). */
  whitelisted?: boolean;
  impersonating?: { id: string; email: string; name: string | null };
}

/** Lifetime tokens one accountant used on one model, priced at that model's own rates. */
export interface AccountantModelUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  /** USD; null while the pricing registry has no entry for this model. */
  cost: number | null;
}

export interface Accountant {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  mailbox: string | null;
  whitelisted: boolean;
  clientCount: number;
  clientsComplete: number;
  docsTotal: number;
  docsCollected: number;
  llmUsage: AccountantModelUsage[];
}

/** The Gemini model every LLM call runs on, for every accountant and client. */
export interface GeminiModelState {
  model: string;
  /** True when set by an admin; false while running on the server's env default. */
  isCustom: boolean;
  updatedAt: string | null;
  options: string[];
}

export interface WhitelistEntry {
  email: string;
  name: string | null;
  signedUp: boolean;
  createdAt: string;
}

export interface MailboxStatus {
  claimed: boolean;
  emailAddress: string | null;
  localPart: string | null;
  domain: string;
}

export interface WaSenderStatus {
  assigned: boolean;
  phoneNumber: string | null;
}

export interface MailboxAvailability {
  name: string;
  available: boolean;
  reason?: 'invalid' | 'reserved' | 'taken';
}

export const api = {
  me: () => request<Me>('/api/me'),
  logout: () => request<{ ok: true }>('/api/logout', { method: 'POST' }),
  mailboxStatus: () => request<MailboxStatus>('/api/mailbox'),
  mailboxAvailability: (name: string) =>
    request<MailboxAvailability>(`/api/mailbox/availability?name=${encodeURIComponent(name)}`),
  claimMailbox: (name: string) =>
    request<{ mailbox: { emailAddress: string; localPart: string } }>('/api/mailbox', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  waSenderStatus: () => request<WaSenderStatus>('/api/wa-sender'),
  dashboard: () => request<DashboardSummary>('/api/dashboard'),
  listClients: () => request<{ clients: Client[] }>('/api/clients'),
  createClient: (args: {
    name: string;
    email: string;
    documents: { name: string; description?: string | null }[];
  }) => request<{ client: Client }>('/api/clients', { method: 'POST', body: JSON.stringify(args) }),
  getClient: (id: string) =>
    request<{ client: Client; nextScheduled: NextScheduled | null; documents: ClientDocument[] }>(
      `/api/clients/${id}`,
    ),
  addDocument: (clientId: string, args: { name: string; description?: string | null }) =>
    request<{ document: ClientDocument }>(`/api/clients/${clientId}/documents`, {
      method: 'POST',
      body: JSON.stringify(args),
    }),
  updateDocument: (
    clientId: string,
    docId: string,
    patch: Partial<Pick<ClientDocument, 'name' | 'description' | 'status'>>,
  ) =>
    request<{ document: ClientDocument }>(`/api/clients/${clientId}/documents/${docId}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),
  deleteDocument: (clientId: string, docId: string) =>
    request<{ ok: true }>(`/api/clients/${clientId}/documents/${docId}`, { method: 'DELETE' }),
  updateClient: (id: string, patch: Partial<Pick<Client, 'name' | 'occupation' | 'phone' | 'company' | 'notes'>>) =>
    request<{ client: Client }>(`/api/clients/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteClient: (id: string) => request<{ ok: true }>(`/api/clients/${id}`, { method: 'DELETE' }),
  setWhatsApp: (id: string, args: { enabled: boolean; phone?: string }) =>
    request<{ client: Client }>(`/api/clients/${id}/whatsapp`, { method: 'PUT', body: JSON.stringify(args) }),
  listEmails: (clientId: string) => request<{ emails: Email[] }>(`/api/clients/${clientId}/emails`),
  sendScheduledNow: (clientId: string) => request<{ ok: true }>(`/api/clients/${clientId}/send-now`, { method: 'POST' }),
  listFiles: (clientId: string) => request<{ files: DocumentFile[] }>(`/api/clients/${clientId}/files`),
  fileDownloadUrl: (clientId: string, fileId: string) => `/api/clients/${clientId}/files/${fileId}/download`,
  adminListAccountants: () => request<{ accountants: Accountant[] }>('/api/admin/accountants'),
  adminGetModel: () => request<GeminiModelState>('/api/admin/model'),
  adminSetModel: (model: string) =>
    request<GeminiModelState>('/api/admin/model', { method: 'PUT', body: JSON.stringify({ model }) }),
  adminListWhitelist: () => request<{ entries: WhitelistEntry[] }>('/api/admin/whitelist'),
  adminAddToWhitelist: (email: string, name?: string) =>
    request<{ entry: WhitelistEntry }>('/api/admin/whitelist', {
      method: 'POST',
      body: JSON.stringify({ email, ...(name ? { name } : {}) }),
    }),
  adminRemoveFromWhitelist: (email: string) =>
    request<{ ok: true }>(`/api/admin/whitelist/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  impersonate: (userId: string) =>
    request<{ ok: true }>('/api/admin/impersonate', { method: 'POST', body: JSON.stringify({ userId }) }),
  stopImpersonating: () => request<{ ok: true }>('/api/admin/impersonate/stop', { method: 'POST' }),
  getPromptTemplate: () => request<PromptTemplateState>('/api/prompt-template'),
  savePromptTemplate: (template: string) =>
    request<PromptTemplateState>('/api/prompt-template', { method: 'PUT', body: JSON.stringify({ template }) }),
  resetPromptTemplate: () => request<PromptTemplateState>('/api/prompt-template/reset', { method: 'POST' }),
};
