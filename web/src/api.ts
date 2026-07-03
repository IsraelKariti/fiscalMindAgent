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
  listClients: () => request<{ clients: Client[] }>('/api/clients'),
  createClient: (args: {
    name: string;
    email: string;
    subject: string;
    body: string;
    delayMinutes: number;
    documents: string[];
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
  listEmails: (clientId: string) => request<{ emails: Email[] }>(`/api/clients/${clientId}/emails`),
  getPromptTemplate: () => request<PromptTemplateState>('/api/prompt-template'),
  savePromptTemplate: (template: string) =>
    request<PromptTemplateState>('/api/prompt-template', { method: 'PUT', body: JSON.stringify({ template }) }),
  resetPromptTemplate: () => request<PromptTemplateState>('/api/prompt-template/reset', { method: 'POST' }),
};
