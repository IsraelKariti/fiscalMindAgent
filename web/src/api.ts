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

export interface DocumentFile {
  id: string;
  client_id: string;
  email_id: string | null;
  client_document_id: string | null;
  filename: string;
  content_type: string;
  size_bytes: string;
  created_at: string;
}

export interface Email {
  id: string;
  client_id: string;
  direction: 'inbound' | 'outbound';
  status: 'draft' | 'sent' | 'received';
  subject: string;
  body: string;
  sent_at: string | null;
  created_at: string;
}

export interface NextScheduled {
  scheduledFor: string;
  subject: string | null;
  body: string | null;
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
  listEmails: (clientId: string) => request<{ emails: Email[] }>(`/api/clients/${clientId}/emails`),
  listFiles: (clientId: string) => request<{ files: DocumentFile[] }>(`/api/clients/${clientId}/files`),
  fileDownloadUrl: (clientId: string, fileId: string) => `/api/clients/${clientId}/files/${fileId}/download`,
  adminListAccountants: () => request<{ accountants: Accountant[] }>('/api/admin/accountants'),
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
