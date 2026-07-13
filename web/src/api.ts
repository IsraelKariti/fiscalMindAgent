export type GoalStatus = 'pending' | 'complete';

/** The debt collector's latest per-client analysis (clients.agent_fields.debt). */
export interface DebtSnapshot {
  status: 'in_debt' | 'no_debt' | 'paid' | 'no_data';
  amount: string | null;
  reason: string | null;
  payment_plan: 'monthly' | 'bi_monthly' | 'other' | 'unknown';
  recurring_payments: string | null;
  one_time_payments: string | null;
  /** The LLM's explanation — the workspace surface for silent completions. */
  reasoning: string;
  analyzed_at: string;
  paid_confirmed_at?: string;
}

/** Per-agent scalar fields (clients.agent_fields JSONB). */
export interface ClientAgentFields {
  /** The doc collector's optional collection deadline ("YYYY-MM-DD"). */
  due_date?: string | null;
  /** Set when the accountant was emailed that the due date passed (idempotency key). */
  overdue_notified_at?: string;
  /** Set while the agent is stopped because the due date passed — the "handed off" UI state. */
  overdue_stopped_at?: string;
  /** The debt collector's latest analysis snapshot. */
  debt?: DebtSnapshot;
}

export interface Client {
  id: string;
  name: string;
  email_address: string;
  goal_status: GoalStatus;
  agent_fields: ClientAgentFields;
  occupation: string | null;
  phone: string | null;
  company: string | null;
  notes: string | null;
  /** Validated E.164 number used for WhatsApp (the free-text `phone` field is unrelated). */
  wa_phone: string | null;
  wa_enabled: boolean;
  wa_opted_in_at: string | null;
  wa_opted_out_at: string | null;
  /** True while the accountant has paused the agent's outreach to this client. */
  paused: boolean;
  /** Set while a planning attempt is in flight; stale = the attempt died mid-flight. */
  drafting_since: string | null;
  /** Set when the last planning attempt threw; the timeline shows a Retry button. */
  draft_failed_at: string | null;
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
  /** The agent stopped chasing because the collection due date passed (doc collector). */
  overdue_stopped: boolean;
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

/**
 * Where and how API calls are sent. The default is the standalone SPA: same
 * origin under /api, authenticated by the session cookie. The monday custom
 * object reconfigures this at boot (see monday/objectMain.tsx) to hit the
 * /api/monday/app mount with a fresh sessionToken per request — cookies don't
 * cross into the monday iframe.
 */
interface ApiTransport {
  basePath: string;
  /** Extra headers per request (monday: Authorization: Bearer <sessionToken>). */
  getAuthHeaders?: () => Promise<Record<string, string>>;
  /** Token appended as ?sessionToken= to URLs that cannot carry headers (SSE, downloads). */
  getUrlToken?: () => Promise<string>;
}

let transport: ApiTransport = { basePath: '/api' };

export function configureApi(next: ApiTransport): void {
  transport = next;
}

/** Appends the transport's URL token for header-less consumers (EventSource, downloads). */
async function tokenizedUrl(path: string): Promise<string> {
  const token = transport.getUrlToken ? await transport.getUrlToken() : null;
  return `${transport.basePath}${path}${token ? `?sessionToken=${encodeURIComponent(token)}` : ''}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const auth = transport.getAuthHeaders ? await transport.getAuthHeaders() : undefined;
  const res = await fetch(transport.basePath + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...auth,
    },
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
  /** Tier of the workspace being viewed — the impersonated accountant's while impersonating, null for admins. */
  tier?: AccountTier | null;
  /** Where "Upgrade to Premium" points until self-serve billing exists. */
  contactEmail?: string | null;
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
  /** Null when the user is not whitelisted (tier lives on the whitelist entry). */
  tier: AccountTier | null;
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

/** A Twilio-owned (billed) number not assigned to any agent instance. */
export interface OrphanedWaNumber {
  phoneNumber: string;
  friendlyName: string;
  dateCreated: string;
}

export type AccountTier = 'normal' | 'premium';

export interface WhitelistEntry {
  email: string;
  name: string | null;
  tier: AccountTier;
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

/** The signed-in accountant's monday OAuth connection (server-side API token). */
export interface MondayConnection {
  /** False until MONDAY_CLIENT_ID/SECRET are set server-side. */
  configured: boolean;
  connected: boolean;
  scopes: string | null;
}

/** The signed-in accountant's Google OAuth connection (drive.file — Sheets/Docs knowledge sources). */
export interface GoogleConnection {
  /** False until GOOGLE_OAUTH_CLIENT_ID/SECRET are set server-side. */
  configured: boolean;
  connected: boolean;
  scopes: string | null;
}

/** What the Google Picker popup needs: a fresh access token + the (public) API key and app id. */
export interface GooglePickerConfig {
  accessToken: string;
  apiKey: string;
  appId: string | null;
}

/** Tabs + header columns of one picked spreadsheet (the phone/name mapping UI). */
export interface SpreadsheetMeta {
  title: string;
  sheets: { title: string; headers: string[] }[];
}

/** The customer-service agent's per-instance config (agent_instances.settings). */
export interface CustomerServiceSettings {
  docIds: string[];
  boards: { boardId: string; phoneColumnId: string; nameColumnId?: string; boardName?: string }[];
  sheets: { spreadsheetId: string; spreadsheetName?: string; sheetTitle: string; phoneColumn: string; nameColumn?: string }[];
  googleDocs: { documentId: string; name: string }[];
}

/** The debt collector's per-instance config (agent_instances.settings). */
export interface DebtCollectorSettings {
  boards: { boardId: string; emailColumnId: string; nameColumnId?: string; boardName?: string }[];
  sheets: { spreadsheetId: string; spreadsheetName?: string; sheetTitle: string; emailColumn: string; nameColumn?: string }[];
}

export interface MondayDocMeta {
  id: string;
  name: string;
}

export interface MondayBoardMeta {
  id: string;
  name: string;
  columns: { id: string; title: string; type: string }[];
}

/** One enabled agent of the signed-in accountant (GET /agents). */
export interface AgentInstance {
  id: string;
  agentType: string;
  name: string;
  enabled: boolean;
  /** Only populated by the admin listing (GET /admin/accountants/:userId/agents). */
  waPhoneNumber?: string | null;
}

/**
 * The agent-workspace endpoints, rooted at a path prefix: '' hits the legacy
 * unprefixed mount (resolves to the doc_collector instance server-side),
 * `/agents/<id>` hits that instance explicitly. Same handlers either way.
 */
function makeWorkspaceApi(prefix: string) {
  return {
    dashboard: () => request<DashboardSummary>(`${prefix}/dashboard`),
    listClients: () => request<{ clients: Client[] }>(`${prefix}/clients`),
    createClient: (args: {
      name: string;
      email: string;
      documents: { name: string; description?: string | null }[];
      /** Optional collection deadline ("YYYY-MM-DD"); the agent paces follow-ups toward it. */
      dueDate?: string | null;
    }) => request<{ client: Client }>(`${prefix}/clients`, { method: 'POST', body: JSON.stringify(args) }),
    getClient: (id: string) =>
      request<{ client: Client; nextScheduled: NextScheduled | null; documents: ClientDocument[] }>(
        `${prefix}/clients/${id}`,
      ),
    addDocument: (clientId: string, args: { name: string; description?: string | null }) =>
      request<{ document: ClientDocument }>(`${prefix}/clients/${clientId}/documents`, {
        method: 'POST',
        body: JSON.stringify(args),
      }),
    updateDocument: (
      clientId: string,
      docId: string,
      patch: Partial<Pick<ClientDocument, 'name' | 'description' | 'status'>>,
    ) =>
      request<{ document: ClientDocument }>(`${prefix}/clients/${clientId}/documents/${docId}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    deleteDocument: (clientId: string, docId: string) =>
      request<{ ok: true }>(`${prefix}/clients/${clientId}/documents/${docId}`, { method: 'DELETE' }),
    updateClient: (id: string, patch: Partial<Pick<Client, 'name' | 'occupation' | 'phone' | 'company' | 'notes'>>) =>
      request<{ client: Client }>(`${prefix}/clients/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    deleteClient: (id: string) => request<{ ok: true }>(`${prefix}/clients/${id}`, { method: 'DELETE' }),
    setWhatsApp: (id: string, args: { enabled: boolean; phone?: string }) =>
      request<{ client: Client }>(`${prefix}/clients/${id}/whatsapp`, { method: 'PUT', body: JSON.stringify(args) }),
    waSenderStatus: () => request<WaSenderStatus>(`${prefix}/wa-sender`),
    listEmails: (clientId: string) => request<{ emails: Email[] }>(`${prefix}/clients/${clientId}/emails`),
    sendScheduledNow: (clientId: string) =>
      request<{ ok: true }>(`${prefix}/clients/${clientId}/send-now`, { method: 'POST' }),
    setPaused: (clientId: string, paused: boolean) =>
      request<{ client: Client }>(`${prefix}/clients/${clientId}/pause`, { method: 'PUT', body: JSON.stringify({ paused }) }),
    /** Doc collector only: sets or clears the collection due date; editing it un-stops an overdue-stopped client. */
    setDueDate: (clientId: string, dueDate: string | null) =>
      request<{ client: Client }>(`${prefix}/clients/${clientId}/due-date`, {
        method: 'PUT',
        body: JSON.stringify({ dueDate }),
      }),
    retryDraft: (clientId: string) => request<{ ok: true }>(`${prefix}/clients/${clientId}/redraft`, { method: 'POST' }),
    listFiles: (clientId: string) => request<{ files: DocumentFile[] }>(`${prefix}/clients/${clientId}/files`),
    /** Async because the monday transport appends a freshly fetched ?sessionToken=. */
    fileDownloadUrl: (clientId: string, fileId: string) =>
      tokenizedUrl(`${prefix}/clients/${clientId}/files/${fileId}/download`),
    eventsUrl: (clientId: string) => tokenizedUrl(`${prefix}/clients/${clientId}/events`),
    // Customer-service agent (routes exist only on customer_service instances).
    csGetSettings: () =>
      request<{ settings: CustomerServiceSettings; mondayConnected: boolean; googleConnected: boolean }>(
        `${prefix}/customer-service/settings`,
      ),
    csSaveSettings: (settings: CustomerServiceSettings) =>
      request<{ settings: CustomerServiceSettings }>(`${prefix}/customer-service/settings`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    csListMondayDocs: () => request<{ docs: MondayDocMeta[] }>(`${prefix}/customer-service/monday/docs`),
    csListMondayBoards: () => request<{ boards: MondayBoardMeta[] }>(`${prefix}/customer-service/monday/boards`),
    csSpreadsheetMeta: (spreadsheetId: string) =>
      request<{ meta: SpreadsheetMeta }>(
        `${prefix}/customer-service/google/spreadsheets/${encodeURIComponent(spreadsheetId)}/meta`,
      ),
    // Debt-collector agent (routes exist only on debt_collector instances).
    dcGetSettings: () =>
      request<{ settings: DebtCollectorSettings; mondayConnected: boolean; googleConnected: boolean }>(
        `${prefix}/debt-collector/settings`,
      ),
    dcSaveSettings: (settings: DebtCollectorSettings) =>
      request<{ settings: DebtCollectorSettings }>(`${prefix}/debt-collector/settings`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    dcListMondayBoards: () => request<{ boards: MondayBoardMeta[] }>(`${prefix}/debt-collector/monday/boards`),
    dcSpreadsheetMeta: (spreadsheetId: string) =>
      request<{ meta: SpreadsheetMeta }>(
        `${prefix}/debt-collector/google/spreadsheets/${encodeURIComponent(spreadsheetId)}/meta`,
      ),
  };
}

export type WorkspaceApi = ReturnType<typeof makeWorkspaceApi>;

/** The workspace API scoped to one agent instance (/agents/:agentId/...). */
export function agentApi(agentId: string): WorkspaceApi {
  return makeWorkspaceApi(`/agents/${agentId}`);
}

export const api = {
  ...makeWorkspaceApi(''),
  me: () => request<Me>('/me'),
  logout: () => request<{ ok: true }>('/logout', { method: 'POST' }),
  listAgents: () => request<{ agents: AgentInstance[] }>('/agents'),
  mailboxStatus: () => request<MailboxStatus>('/mailbox'),
  mailboxAvailability: (name: string) =>
    request<MailboxAvailability>(`/mailbox/availability?name=${encodeURIComponent(name)}`),
  claimMailbox: (name: string) =>
    request<{ mailbox: { emailAddress: string; localPart: string } }>('/mailbox', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  mondayConnection: () => request<MondayConnection>('/monday-connection'),
  mondayConnectUrl: () => request<{ url: string }>('/monday-connection/url'),
  mondayDisconnect: () => request<{ ok: true }>('/monday-connection', { method: 'DELETE' }),
  googleConnection: () => request<GoogleConnection>('/google-connection'),
  googleConnectUrl: () => request<{ url: string }>('/google-connection/url'),
  googleDisconnect: () => request<{ ok: true }>('/google-connection', { method: 'DELETE' }),
  googlePickerConfig: () => request<GooglePickerConfig>('/google-connection/picker'),
  adminListAccountants: () => request<{ accountants: Accountant[] }>('/admin/accountants'),
  adminListAccountantAgents: (userId: string) =>
    request<{ agents: AgentInstance[]; availableTypes: string[] }>(`/admin/accountants/${userId}/agents`),
  adminEnableAgent: (userId: string, agentType: string) =>
    request<{ agent: AgentInstance }>(`/admin/accountants/${userId}/agents`, {
      method: 'POST',
      body: JSON.stringify({ agentType }),
    }),
  adminDisableAgent: (userId: string, agentType: string) =>
    request<{ ok: true }>(`/admin/accountants/${userId}/agents/${encodeURIComponent(agentType)}`, {
      method: 'DELETE',
    }),
  adminSetWaSender: (agentInstanceId: string, phoneNumber: string) =>
    request<{ sender: { agentInstanceId: string; phoneNumber: string } }>('/admin/wa-senders', {
      method: 'POST',
      body: JSON.stringify({ agentInstanceId, phoneNumber }),
    }),
  adminProvisionWaSender: (agentInstanceId: string) =>
    request<{ sender: { agentInstanceId: string; phoneNumber: string }; senderStatus: string }>(
      '/admin/wa-senders/provision',
      { method: 'POST', body: JSON.stringify({ agentInstanceId }) },
    ),
  adminDeleteWaSender: (agentInstanceId: string) =>
    request<{ ok: true }>(`/admin/wa-senders/${agentInstanceId}`, { method: 'DELETE' }),
  adminReleaseWaSender: (agentInstanceId: string) =>
    request<{ ok: true }>(`/admin/wa-senders/${agentInstanceId}/release`, { method: 'POST' }),
  adminListOrphanedWaNumbers: () => request<{ numbers: OrphanedWaNumber[] }>('/admin/wa-numbers/orphaned'),
  adminReleaseOrphanedWaNumber: (phoneNumber: string) =>
    request<{ ok: true }>('/admin/wa-numbers/release', { method: 'POST', body: JSON.stringify({ phoneNumber }) }),
  adminGetModel: () => request<GeminiModelState>('/admin/model'),
  adminSetModel: (model: string) =>
    request<GeminiModelState>('/admin/model', { method: 'PUT', body: JSON.stringify({ model }) }),
  adminListWhitelist: () => request<{ entries: WhitelistEntry[] }>('/admin/whitelist'),
  adminAddToWhitelist: (email: string, name?: string, tier?: AccountTier) =>
    request<{ entry: WhitelistEntry }>('/admin/whitelist', {
      method: 'POST',
      body: JSON.stringify({ email, ...(name ? { name } : {}), ...(tier ? { tier } : {}) }),
    }),
  adminRemoveFromWhitelist: (email: string) =>
    request<{ ok: true }>(`/admin/whitelist/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  adminSetTier: (email: string, tier: AccountTier) =>
    request<{ ok: true }>(`/admin/whitelist/${encodeURIComponent(email)}/tier`, {
      method: 'PUT',
      body: JSON.stringify({ tier }),
    }),
  impersonate: (userId: string) =>
    request<{ ok: true }>('/admin/impersonate', { method: 'POST', body: JSON.stringify({ userId }) }),
  stopImpersonating: () => request<{ ok: true }>('/admin/impersonate/stop', { method: 'POST' }),
  getPromptTemplate: () => request<PromptTemplateState>('/prompt-template'),
  savePromptTemplate: (template: string) =>
    request<PromptTemplateState>('/prompt-template', { method: 'PUT', body: JSON.stringify({ template }) }),
  resetPromptTemplate: () => request<PromptTemplateState>('/prompt-template/reset', { method: 'POST' }),
};
