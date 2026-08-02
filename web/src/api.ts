export type GoalStatus = 'pending' | 'complete';

/** The debt collector's latest per-client analysis (clients.agent_fields.debt). */
export interface DebtSnapshot {
  /** 'paid_claimed' = the client claims payment but the data still shows debt — awaiting the accountant's confirmation. */
  status: 'in_debt' | 'no_debt' | 'paid' | 'paid_claimed' | 'no_data';
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

/** 'claimed' = the client says they delivered it outside email; awaits the accountant's confirmation. */
export type DocumentStatus = 'pending' | 'claimed' | 'collected';

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
  /** The analyzer saw instruction-like text addressed at an AI inside the file; absent on older rows. */
  injection_suspected?: boolean;
}

export interface DocumentFile {
  id: string;
  client_id: string;
  email_id: string | null;
  client_document_id: string | null;
  filename: string;
  /** Display label when the filename isn't descriptive (e.g. employer name on a tax-fetched 106). */
  label: string | null;
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
  /** Set when the send attempt threw — the timeline shows the draft as failed with a Retry. */
  sendFailedAt: string | null;
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
  impersonating?: { id: string; email: string; name: string | null };
  /** Non-null on non-production stacks (e.g. 'sandbox') — shows the env banner. */
  envName?: string | null;
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

/** One agent instance in the admin roster: identity + how many clients it owns. */
export interface AccountantAgentSummary {
  id: string;
  agentType: string;
  name: string | null;
  enabled: boolean;
  clientCount: number;
}

export interface Accountant {
  id: string;
  email: string;
  name: string | null;
  /** Admin-entered Hebrew name of the accountant/firm — the name agents sign with. */
  hebrewName: string | null;
  createdAt: string;
  mailbox: string | null;
  whitelisted: boolean;
  /** False for invited accounts — admin-created at activation, no Google sign-in yet. */
  signedIn: boolean;
  /** Every agent instance incl. disabled ones (agent-specific stats live on the agent pages). */
  agents: AccountantAgentSummary[];
  llmUsage: AccountantModelUsage[];
}

/**
 * One day×accountant×agent-instance×model bucket of the admin spend time
 * series (GET /admin/llm-usage/daily). The endpoint returns the raw cube; the
 * usage page groups and filters client-side.
 */
export interface LlmDailyUsage {
  /** "YYYY-MM-DD", bucketed in the server's ACCOUNTANT_TIMEZONE. */
  day: string;
  userId: string;
  /** Null only for legacy CLI-era clients that predate agent_instances. */
  agentInstanceId: string | null;
  agentType: string;
  instanceName: string | null;
  model: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  /** USD; null while the pricing registry has no entry for this model. */
  cost: number | null;
}

/**
 * One row of the per-action audit trail (GET /admin/audit-events). The
 * endpoint returns the newest raw rows; the audit page filters client-side.
 */
export interface AuditEvent {
  id: string;
  occurredAt: string;
  actorType: 'agent' | 'admin' | 'accountant' | 'system';
  actorEmail: string | null;
  agentInstanceId: string | null;
  agentType: string | null;
  instanceName: string | null;
  clientId: string | null;
  clientName: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  severity: 'info' | 'warning' | 'critical';
  suspectedInjection: boolean;
  detail: Record<string, unknown>;
}

/** One anomaly-detection finding (GET /admin/alerts). */
export interface AnomalyAlert {
  id: string;
  createdAt: string;
  rule: string;
  scopeKey: string;
  severity: 'warning' | 'critical';
  title: string;
  detail: Record<string, unknown>;
  status: 'open' | 'acked';
  notifiedAt: string | null;
  ackedAt: string | null;
}

/** The platform-wide emergency stop: on = every agent is silenced at once. */
export interface KillSwitchState {
  on: boolean;
  updatedAt: string | null;
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

/** An account with admin access (users.is_admin — DB-managed, not the env allowlist). */
export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
}

export interface WhitelistEntry {
  email: string;
  name: string | null;
  hebrewName: string | null;
  signedUp: boolean;
  createdAt: string;
}

/** Legacy account mailbox (read-only) — instances that predate admin-assigned addresses still send from it. */
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

/** Admin view: the assigned number's live WhatsApp registration state on Twilio. */
export interface AdminWaSenderStatus {
  phoneNumber: string;
  /** ONLINE | CREATING | OFFLINE | UNREGISTERED (no sender on Twilio) | UNKNOWN (Twilio not configured). */
  senderStatus: string;
  /** Meta's explanation while OFFLINE (e.g. WABA number limit); empty otherwise. */
  offlineReasons: { code: string; message: string }[];
}

/** This agent's admin-assigned sender address (null until an admin assigns one). */
export interface EmailSenderStatus {
  assigned: boolean;
  emailAddress: string | null;
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

/** Client-import sources config (doc collector; agent_instances.settings). */
export interface ClientSourcesConfig {
  boards: {
    boardId: string;
    emailColumnId: string;
    nameColumnId?: string;
    phoneColumnId?: string;
    idNumberColumnId?: string;
    taxUserCodeColumnId?: string;
    documentsColumnId?: string;
    boardName?: string;
    /** Set when the source is added; the server clears it after a clean import scan. */
    pendingImport?: boolean;
  }[];
  sheets: {
    spreadsheetId: string;
    spreadsheetName?: string;
    sheetTitle: string;
    emailColumn: string;
    nameColumn?: string;
    phoneColumn?: string;
    idNumberColumn?: string;
    taxUserCodeColumn?: string;
    documentsColumn?: string;
    /** Set when the source is added; the server clears it after a clean import scan. */
    pendingImport?: boolean;
  }[];
}

/** Outcome of one client-import run (POST /client-sources/scan). */
export interface ClientImportScanResult {
  enrolled: number;
  skipped: number;
  failedSources: string[];
  notReady: 'no_sources' | 'no_mailbox' | 'no_documents' | null;
}

/** Narrows an "import now" scan to one configured source; omit to scan everything. */
export type ClientImportSourceRef = { boardId: string } | { spreadsheetId: string; sheetTitle: string };

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
  /** Admin listing only: the agent's sender address, null until an admin assigns one. */
  emailAddress?: string | null;
  /** Admin listing only: derived default for the address input (null: no mailbox claimed / type doesn't email). */
  suggestedEmailLocalPart?: string | null;
  /** Admin listing only: false for agent types that never email clients (no address to manage). */
  emailCapable?: boolean;
  /** Admin listing only: true for agent types whose work is scoped to one tax year. */
  taxYearCapable?: boolean;
  /** Admin listing only: the configured tax year, null until an admin sets one (code falls back to the last concluded year). */
  taxYear?: number | null;
}

/** Per-type email facts for the admin agent page — covers types with no instance yet. */
export interface AgentTypeEmailInfo {
  emailCapable: boolean;
  suggestedEmailLocalPart: string | null;
  taxYearCapable: boolean;
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
      /** Optional; any usable number turns the WhatsApp channel on by default. */
      phone?: string | null;
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
    emailSender: () => request<EmailSenderStatus>(`${prefix}/email-sender`),
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
    /** Re-fires a scheduled send whose attempt failed, keeping the same draft. */
    retrySend: (clientId: string) => request<{ ok: true }>(`${prefix}/clients/${clientId}/retry-send`, { method: 'POST' }),
    listFiles: (clientId: string) => request<{ files: DocumentFile[] }>(`${prefix}/clients/${clientId}/files`),
    /** Async because the monday transport appends a freshly fetched ?sessionToken=. */
    fileDownloadUrl: (clientId: string, fileId: string) =>
      tokenizedUrl(`${prefix}/clients/${clientId}/files/${fileId}/download`),
    /** Inline-disposition variant for the in-app viewer modal (iframe/img src). */
    fileViewUrl: (clientId: string, fileId: string) =>
      tokenizedUrl(`${prefix}/clients/${clientId}/files/${fileId}/view`),
    eventsUrl: (clientId: string) => tokenizedUrl(`${prefix}/clients/${clientId}/events`),
    /** SSE ticks when this instance's client roster changes — the sidebar refetches the list. */
    clientsEventsUrl: () => tokenizedUrl(`${prefix}/events`),
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
    dcConfirmPaid: (clientId: string) =>
      request<{ client: Client }>(`${prefix}/debt-collector/clients/${clientId}/confirm-paid`, { method: 'POST' }),
    dcListMondayBoards: () => request<{ boards: MondayBoardMeta[] }>(`${prefix}/debt-collector/monday/boards`),
    dcSpreadsheetMeta: (spreadsheetId: string) =>
      request<{ meta: SpreadsheetMeta }>(
        `${prefix}/debt-collector/google/spreadsheets/${encodeURIComponent(spreadsheetId)}/meta`,
      ),
    // Client-import sources (routes exist only on doc_collector instances).
    sourcesGetSettings: () =>
      request<{ settings: ClientSourcesConfig; mondayConnected: boolean; googleConnected: boolean }>(
        `${prefix}/client-sources/settings`,
      ),
    sourcesSaveSettings: (settings: ClientSourcesConfig) =>
      request<{ settings: ClientSourcesConfig }>(`${prefix}/client-sources/settings`, {
        method: 'PUT',
        body: JSON.stringify(settings),
      }),
    sourcesListMondayBoards: () => request<{ boards: MondayBoardMeta[] }>(`${prefix}/client-sources/monday/boards`),
    sourcesSpreadsheetMeta: (spreadsheetId: string) =>
      request<{ meta: SpreadsheetMeta }>(
        `${prefix}/client-sources/google/spreadsheets/${encodeURIComponent(spreadsheetId)}/meta`,
      ),
    sourcesScanNow: (source?: ClientImportSourceRef) =>
      request<ClientImportScanResult>(`${prefix}/client-sources/scan`, {
        method: 'POST',
        body: JSON.stringify(source ? { source } : {}),
      }),
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
  mondayConnection: () => request<MondayConnection>('/monday-connection'),
  mondayConnectUrl: () => request<{ url: string }>('/monday-connection/url'),
  mondayDisconnect: () => request<{ ok: true }>('/monday-connection', { method: 'DELETE' }),
  googleConnection: () => request<GoogleConnection>('/google-connection'),
  googleConnectUrl: () => request<{ url: string }>('/google-connection/url'),
  googleDisconnect: () => request<{ ok: true }>('/google-connection', { method: 'DELETE' }),
  googlePickerConfig: () => request<GooglePickerConfig>('/google-connection/picker'),
  adminListAccountants: () => request<{ accountants: Accountant[] }>('/admin/accountants'),
  adminLlmUsageDaily: (days: number) =>
    request<{ since: string; rows: LlmDailyUsage[] }>(`/admin/llm-usage/daily?days=${days}`),
  adminAuditEvents: (days: number) => request<{ events: AuditEvent[] }>(`/admin/audit-events?days=${days}`),
  adminListAlerts: () => request<{ alerts: AnomalyAlert[]; openCount: number }>('/admin/alerts'),
  adminAckAlert: (id: string) => request<{ alert: AnomalyAlert }>(`/admin/alerts/${id}/ack`, { method: 'POST' }),
  adminListAccountantAgents: (userId: string) =>
    request<{
      agents: AgentInstance[];
      availableTypes: string[];
      emailInfoByType: Record<string, AgentTypeEmailInfo>;
      emailDomain: string;
      defaultTaxYear: number;
    }>(`/admin/accountants/${userId}/agents`),
  adminSetAgentEmail: (agentInstanceId: string, localPart: string) =>
    request<{ emailAddress: string }>('/admin/agent-emails', {
      method: 'POST',
      body: JSON.stringify({ agentInstanceId, localPart }),
    }),
  adminSetAgentTaxYear: (agentInstanceId: string, taxYear: number) =>
    request<{ taxYear: number }>('/admin/agent-tax-year', {
      method: 'POST',
      body: JSON.stringify({ agentInstanceId, taxYear }),
    }),
  adminEnableAgent: (userId: string, agentType: string, emailLocalPart?: string, taxYear?: number) =>
    request<{ agent: AgentInstance }>(`/admin/accountants/${userId}/agents`, {
      method: 'POST',
      body: JSON.stringify({
        agentType,
        ...(emailLocalPart ? { emailLocalPart } : {}),
        ...(taxYear != null ? { taxYear } : {}),
      }),
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
  adminGetWaSenderStatus: (agentInstanceId: string) =>
    request<AdminWaSenderStatus>(`/admin/wa-senders/${agentInstanceId}/status`),
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
  adminGetKillSwitch: () => request<KillSwitchState>('/admin/kill-switch'),
  adminSetKillSwitch: (on: boolean) =>
    request<KillSwitchState>('/admin/kill-switch', { method: 'PUT', body: JSON.stringify({ on }) }),
  adminListAdmins: () => request<{ admins: AdminUser[] }>('/admin/admins'),
  adminGrantAdmin: (email: string) =>
    request<{ admin: AdminUser }>('/admin/admins', { method: 'POST', body: JSON.stringify({ email }) }),
  adminRevokeAdmin: (userId: string) =>
    request<{ ok: true }>(`/admin/admins/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  adminListWhitelist: () => request<{ entries: WhitelistEntry[] }>('/admin/whitelist'),
  adminAddToWhitelist: (email: string, name?: string, hebrewName?: string) =>
    request<{ entry: WhitelistEntry }>('/admin/whitelist', {
      method: 'POST',
      body: JSON.stringify({ email, ...(name ? { name } : {}), ...(hebrewName ? { hebrewName } : {}) }),
    }),
  adminSetHebrewName: (email: string, hebrewName: string | null) =>
    request<{ ok: true }>(`/admin/whitelist/${encodeURIComponent(email)}`, {
      method: 'PATCH',
      body: JSON.stringify({ hebrewName }),
    }),
  adminRemoveFromWhitelist: (email: string) =>
    request<{ ok: true }>(`/admin/whitelist/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  adminDeleteAccountant: (userId: string) =>
    request<{ ok: true }>(`/admin/accountants/${encodeURIComponent(userId)}`, { method: 'DELETE' }),
  impersonate: (userId: string) =>
    request<{ ok: true }>('/admin/impersonate', { method: 'POST', body: JSON.stringify({ userId }) }),
  stopImpersonating: () => request<{ ok: true }>('/admin/impersonate/stop', { method: 'POST' }),
  getPromptTemplate: () => request<PromptTemplateState>('/prompt-template'),
  savePromptTemplate: (template: string) =>
    request<PromptTemplateState>('/prompt-template', { method: 'PUT', body: JSON.stringify({ template }) }),
  resetPromptTemplate: () => request<PromptTemplateState>('/prompt-template/reset', { method: 'POST' }),
};
