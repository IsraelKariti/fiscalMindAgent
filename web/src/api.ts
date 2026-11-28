export type GoalStatus = 'pending' | 'complete';

/** Per-agent scalar fields (clients.agent_fields JSONB). */
export interface ClientAgentFields {
  /** The optional collection deadline ("YYYY-MM-DD"). */
  due_date?: string | null;
  /** Capital declaration: the office file number ("מס תיק") read from the monday board at kickoff. */
  file_number?: string;
  /** Capital declaration: the team member named in the board's "יועץ מס" column (openspec `client-tax-advisor`). */
  tax_advisor?: { name: string; email: string | null; monday_user_id: string; match: 'accountant' | 'staff' | 'none'; staff_id?: string };
  /** Capital declaration: the last monday kickoff did not start the client — no advisor with an email on the row (openspec `client-tax-advisor`). Cleared by a kickoff that starts. */
  kickoff_blocked?: { reason: 'advisor_column_unmapped' | 'advisor_cell_empty' | 'advisor_email_unavailable'; at: string };
  /** Capital declaration: the scheduled draft that is the attestation summary (trusted once sent). */
  attestation_request_email_id?: string;
  /** Capital declaration: the client confirmed the closing summary. */
  attestation_confirmed_at?: string;
  /** Capital declaration: the confirming message quote. */
  attestation_evidence?: { message_id: string; quote: string };
  /** Set when the accountant was emailed that the due date passed (idempotency key). */
  overdue_notified_at?: string;
  /** Set while the agent is stopped because the due date passed — the "handed off" UI state. */
  overdue_stopped_at?: string;
  /** Set while the agent is stopped because the client declined the WhatsApp collection (openspec `client-decline`). */
  declined_at?: string;
  /** Capital declaration: the client's marital status from the questionnaire (openspec `spouse-identity`). */
  marital_status?: 'married' | 'not_married';
  /** Capital declaration: the one spouse on file (name / id / sources), shape owned by spouseIdentity.ts. */
  spouse?: unknown;
  /**
   * Capital declaration: the questionnaire the client submitted, written once
   * at enrollment (monday kickoff or the admin test form), in the form's order.
   * Blank answers are never stored. Shown on the admin-only questionnaire tab
   * (openspec `admin-questionnaire-tab`).
   */
  form_answers?: Array<{ question: string; answer: string }>;
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
  /** Set while the turn's inputs are being analyzed (openspec `turn-activity-states`); the timeline shows "processing". Absent on a server without migration 080. */
  processing_since?: string | null;
  /** Set when the last planning attempt threw; the timeline shows a Retry button. */
  draft_failed_at: string | null;
  /** Held by a model-provider outage (openspec `llm-provider-outage`): the agent waits for the system and continues by itself; the timeline shows the waiting notice, never the cause. */
  outage_held_at: string | null;
  /** Soft-deleted (openspec `soft-delete-clients`): out of the roster, read-only for an admin viewing as. null = live. */
  deletedAt: string | null;
  /** Display name of the user who deleted the client; set on the deleted list only. */
  deletedBy: string | null;
  /** Admin test client (openspec `admin-test-client`): listed under view-as only, badged in the sidebar. */
  isTest: boolean;
  /** Lifetime LLM spend in USD (openspec `admin-roster-cost`): present only on an admin's view-as list, never for the accountant. */
  cost?: number;
  /** The agent's question still waiting for the team (openspec `team-questions`); on roster rows only. null = none open. */
  openTeamQuestion?: { toEmail: string; toName: string; askedAt: string } | null;
  created_at: string;
  updated_at: string;
}

/** A question the agent asked the client's team member (openspec `team-questions`). */
export interface TeamQuestion {
  id: string;
  question: string;
  reason: string;
  /** The inbound message the question rests on; null when none. */
  evidenceMessageId: string | null;
  askedAt: string;
  toEmail: string;
  toName: string;
  toMatch: 'accountant' | 'staff';
  /** null while open; 'answered' = an answer for the agent to relay; 'handled_outside' = the team member spoke to the client. */
  closedHow: 'answered' | 'handled_outside' | null;
  /** The answer, or the optional note of a question handled outside. */
  closedText: string | null;
  closedAt: string | null;
  closedByName: string | null;
}

/**
 * Ad-hoc rows use pending/claimed/collected. The capital-declaration
 * intake adds: 'unresolved' (catalog-seeded, interview pending),
 * 'not_required' (client said the asset doesn't apply), 'approved' (the
 * automatic verification pipeline accepted the file), 'retired' (the
 * requirements ladder replaced the document with different ones). 'claimed' =
 * the client says they delivered it outside email or the office already holds
 * it; awaits the accountant's confirmation.
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

/** The verification pipeline's latest verdict for a row (subset the UI renders). */
export interface DocumentVerification {
  passed?: boolean;
  /** Could not be auto-verified (unsupported type, quarantined file). */
  unavailable?: boolean;
  /** Dead-ended (3 failed attempts / unverifiable) — the accountant owns it. */
  stalled?: boolean;
  attempts?: number;
  /** Hebrew failure reasons. */
  reasons?: string[];
  extracted?: {
    issuer?: string | null;
    subject_name?: string | null;
    as_of_date?: string | null;
    amounts?: { label: string; value: number; currency: string }[];
  };
}

export interface ClientDocument {
  id: string;
  client_id: string;
  name: string;
  description: string | null;
  status: DocumentStatus;
  /** Capital-declaration catalog type key; null for ad-hoc (accountant-added) rows. */
  type_key: string | null;
  verification: DocumentVerification | null;
  /** Retired rows only: what replaced the row — other documents, or the client's own declaration. Null on rows retired before this was recorded (shown with the documents). */
  replaced_by?: 'documents' | 'client_declaration' | null;
  /** The client quote behind an agent-made 'not_required' — from a stored inbound message or the intake questionnaire; or the file behind a per-company split row. */
  resolution_evidence: {
    message_id?: string;
    /** 'approved_file': an approved property paper whose proven seller kind retired this row; 'self_evident_file': a file in the client's name that created this row; 'fetched_file': a document the platform fetched from the client's own login (issuer = the site) that created this row; 'chat': a cost the client stated in the conversation. */
    source?: 'form' | 'form_empty' | 'file' | 'approved_file' | 'self_evident_file' | 'fetched_file' | 'chat' | 'chat_vehicle';
    /** 'self_evident_file' only: whom the printed holders matched. */
    matched?: 'client' | 'spouse';
    question?: string;
    quote?: string;
    file_id?: string;
    issuer?: string;
    employer?: string;
    fact?: 'seller_private' | 'seller_builder';
    /** 'chat' only: the stated purchase cost and its currency code. */
    amount?: number;
    currency?: string;
    /** 'chat_vehicle' only: every client statement the vehicle declaration rests on, and the facts merged from them. */
    statements?: { message_id?: string; quote?: string }[];
    facts?: { manufacturer?: string; model?: string; production_year?: number; license_plate?: string; purchase_cost?: number; currency?: string };
  } | null;
  created_at: string;
  updated_at: string;
}

/** 'blocked': the injection screen flagged the file before classification — quarantined, never analyzed. */
/** 'not_needed': the platform fetched the file itself — content analysis does not apply. */
export type FileAnalysisStatus = 'pending' | 'done' | 'failed' | 'unsupported' | 'blocked' | 'not_needed' | 'split';

/** What the injection screen found on a withheld message / blocked file. */
export interface InjectionBlock {
  detector: 'regex' | 'llm';
  kind: string | null;
  evidence: string | null;
}

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
  /** Display label when the filename isn't descriptive (e.g. employer name on a document-fetched 106). */
  label: string | null;
  content_type: string;
  size_bytes: string;
  analysis_status: FileAnalysisStatus;
  analysis: FileAnalysis | null;
  /** Set with analysis_status 'blocked'. */
  blocked?: InjectionBlock | null;
  /** Set on a child cut out of a multi-document PDF: the file it came from and its 1-based, inclusive page range. */
  parent_file_id?: string | null;
  page_from?: number | null;
  page_to?: number | null;
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
  /** Inbound only: the injection screen withheld this message from the agent. */
  blocked?: InjectionBlock | null;
  sent_at: string | null;
  created_at: string;
}

export interface NextScheduled {
  scheduledFor: string;
  /** Set when the send attempt threw — the timeline shows the draft as failed with a Retry. */
  sendFailedAt: string | null;
  /** The draft awaits admin approval (review mode) — the timeline badge, and "send now" is refused. */
  reviewPending: boolean;
  /** Set when the worker already held the draft because its time arrived unapproved. */
  heldAt: string | null;
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
  /** The agent stopped chasing because the collection due date passed. */
  overdue_stopped: boolean;
  /** The agent stopped because the client declined the WhatsApp collection. */
  declined: boolean;
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

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** The server's machine-readable reason, when it sends one (e.g. `awaiting_review`). */
    public code?: string,
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

/**
 * Admin "view as accountant": every workspace request names the accountant the
 * SPA believes it is showing, and the server rejects it (409, code
 * impersonation_ended) when its own view-as session says otherwise — idled
 * out, exited in another tab, or switched to another accountant. The app shell
 * sets the id after /api/me and listens for the ended signal.
 */
let viewAsUserId: string | null = null;
let onImpersonationEnded: (() => void) | null = null;

export function setViewAs(userId: string | null, onEnded: (() => void) | null): void {
  viewAsUserId = userId;
  onImpersonationEnded = onEnded;
}

/**
 * The view-as session ended. The app shell shows its dialog through the
 * listener; the message is empty so the many `err instanceof ApiError ?
 * err.message : …` call sites render no banner for it.
 */
export class ImpersonationEndedError extends ApiError {
  constructor() {
    super(409, '');
  }
}

export interface RequestOpts {
  /**
   * The app's own traffic (interval refreshes, SSE-triggered reloads) rather
   * than something the user did. The server does not count it as activity, so
   * an untouched open tab still idles out of a view-as session — every new
   * timer-driven call must pass it.
   */
  background?: boolean;
}

/** Appends the transport's URL token for header-less consumers (EventSource, downloads). */
async function tokenizedUrl(path: string): Promise<string> {
  const token = transport.getUrlToken ? await transport.getUrlToken() : null;
  const params = [
    token ? `sessionToken=${encodeURIComponent(token)}` : null,
    viewAsUserId ? `viewAs=${encodeURIComponent(viewAsUserId)}` : null,
  ].filter(Boolean);
  return `${transport.basePath}${path}${params.length > 0 ? `?${params.join('&')}` : ''}`;
}

async function request<T>(path: string, init?: RequestInit, opts?: RequestOpts): Promise<T> {
  const auth = transport.getAuthHeaders ? await transport.getAuthHeaders() : undefined;
  const res = await fetch(transport.basePath + path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(viewAsUserId ? { 'X-FM-View-As': viewAsUserId } : {}),
      ...(opts?.background ? { 'X-FM-Background': '1' } : {}),
      ...auth,
    },
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 409 && (data as { code?: string }).code === 'impersonation_ended') {
    onImpersonationEnded?.();
    throw new ImpersonationEndedError();
  }
  if (!res.ok) {
    const body = data as { error?: string; code?: string };
    // A staff viewer's write refused by the server (openspec
    // `accountant-employee-access`): the UI hides every such control, so this
    // only happens from stale UI — no banner, like the ended view-as session.
    if (res.status === 403 && body.code === 'read_only') throw new ApiError(403, '', body.code);
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`, body.code);
  }
  return data as T;
}

/** PUT of one image file as the raw request body (request() would label it JSON). */
async function uploadImage<T>(path: string, file: File): Promise<T> {
  const auth = transport.getAuthHeaders ? await transport.getAuthHeaders() : undefined;
  const res = await fetch(transport.basePath + path, {
    method: 'PUT',
    body: file,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      ...(viewAsUserId ? { 'X-FM-View-As': viewAsUserId } : {}),
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
  /** Whether this account may use the app (admins are always true; a staff viewer too). */
  whitelisted?: boolean;
  /** 'viewer' = an employee on an accountant's staff list: read-only access to that accountant's workspace. */
  role?: 'accountant' | 'viewer';
  /** The accountant whose workspace a viewer sees (set only with role 'viewer'). */
  viewingFor?: { id: string; email: string; name: string | null; hebrewName: string | null };
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
  /** Prompt-cache read tokens — a subset of inputTokens, billed at the cached rate. */
  cachedTokens: number;
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
  /** The accountant whose staff list carries this email (a read-only viewer); null otherwise. */
  staffOf: string | null;
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
  /** Prompt-cache read tokens — a subset of inputTokens, billed at the cached rate. */
  cachedTokens: number;
  /** USD; null while the pricing registry has no entry for this model. */
  cost: number | null;
}

/** The four LLM call sites an arm can pin a model to (llm_calls.purpose values). */
export const LLM_CALL_PURPOSES = [
  'planner',
  'questionnaire_schema_mapping',
  'injection_detection_llm',
  'file_splitting',
  'file_classification',
  'extract_document',
] as const;
export type LlmCallPurpose = (typeof LLM_CALL_PURPOSES)[number];

/** One client as the admin panel sees it. */
/** A sum of per-draft costs; `unknown` = drafts whose cost is unknown (pre-076, or unpriced) — the UI shows a `+`. */
export interface CostSum {
  known: number;
  unknown: number;
}

/** GET /admin/agents/:id/message-analytics (openspec `discarded-message-analytics`): src/analytics/discardedMessages.ts `Summary` plus the range. */
export interface MessageAnalytics {
  from: string;
  to: string;
  /** The day of the instance's first draft (the "all" preset's start); null for an instance with none. */
  firstDraftDay: string | null;
  /** The IANA zone the days and weeks are bucketed in. */
  timeZone: string;
  /** The quiet wait the agent keeps today before writing (INBOUND_QUIET_SECONDS); the wait curve marks it. */
  currentQuietSeconds: number;
  tiles: {
    written: number;
    sent: number;
    discarded: number;
    pending: number;
    discardRate: number | null;
    discardedCost: CostSum;
    allCost: CostSum;
    wasteShare: number | null;
  };
  reasons: { reason: string; count: number; share: number; cost: CostSum }[];
  triggers: {
    trigger: string | null;
    written: number;
    sent: number;
    discarded: number;
    discardRate: number | null;
    discardedCost: CostSum;
    topReason: string | null;
  }[];
  lifetime: {
    known: number;
    medianMs: number | null;
    averageMs: number | null;
    waitShareKnown: number;
    medianWaitShare: number | null;
    /** Share of client-reply discards avoided by a wait of i × stepSeconds (src/analytics/discardedMessages.ts `WaitCurve`). */
    waitCurve: { stepSeconds: number; total: number; totalCost: CostSum; points: { avoided: number; cost: CostSum }[] };
  };
  weeks: { weekStart: string; written: number; discarded: number; discardedCost: CostSum }[];
  topClients: {
    clientId: string;
    name: string;
    deleted: boolean;
    written: number;
    discarded: number;
    discardRate: number | null;
    discardedCost: CostSum;
  }[];
}

/** One client's row on the admin documents tab (src/analytics/documentCost.ts `ClientFigures`). */
export interface DocumentCostClient {
  clientId: string;
  name: string;
  state: 'completed' | 'running' | 'paused' | 'declined';
  deleted: boolean;
  test: boolean;
  itemsFile: number;
  itemsForm: number;
  itemsChat: number;
  itemsAccountant: number;
  itemsOpen: number;
  itemsSettled: number;
  messagesSent: number;
  messagesReceived: number;
  calls: number;
  failed: number;
  cost: number;
  unpriced: number;
  fileCost: number;
  costPerFile: number | null;
  costPerItem: number | null;
  daysActive: number | null;
}

/** The admin documents tab's reply (openspec `document-cost-analytics`): lifetime figures per client, pooled tiles and the footer. */
export interface DocumentCost {
  agentInstanceId: string;
  clientKind: 'all' | 'live' | 'test';
  completedOnly: boolean;
  clients: DocumentCostClient[];
  tiles: {
    clients: number;
    cost: number;
    unpriced: number;
    itemsFile: number;
    itemsForm: number;
    itemsChat: number;
    itemsAccountant: number;
    itemsOpen: number;
    costPerFile: number | null;
    costPerItem: number | null;
    medianCostPerItem: number | null;
    costPerCompleted: number | null;
    completed: number;
    fileShare: number | null;
    messagesPerItem: number | null;
    medianDaysCompleted: number | null;
  };
  footer: {
    itemsFile: number;
    itemsForm: number;
    itemsChat: number;
    itemsAccountant: number;
    itemsOpen: number;
    messagesSent: number;
    messagesReceived: number;
    cost: number;
    unpriced: number;
    costPerFile: number | null;
    costPerItem: number | null;
  };
}

export interface AdminClient {
  id: string;
  name: string;
  emailAddress: string;
  waPhone: string | null;
  goalStatus: 'pending' | 'complete';
  paused: boolean;
  adminPaused: boolean;
  createdAt: string;
  lastMessageAt?: string | null;
  /** Priced spend (USD) of every LLM call of this client so far; 0 when none. */
  cost?: number;
}

export interface AdminConversationMessage {
  id: string;
  direction: 'inbound' | 'outbound';
  status: string;
  channel: 'email' | 'whatsapp';
  subject: string;
  body: string;
  isTemplate: boolean;
  reasoning: string | null;
  reviewStatus: string | null;
  heldAt: string | null;
  sentAt: string | null;
  createdAt: string;
  /** An unsent draft a replan threw away (never the live scheduled one). */
  discarded?: boolean;
}

/** The full thread the agent is having with one client (GET /admin/clients/:id/conversation). */
export interface AdminConversation {
  client: AdminClient;
  agentInstanceId: string | null;
  agentType: string | null;
  instanceName: string | null;
  accountantEmail: string | null;
  accountantName: string | null;
  messages: AdminConversationMessage[];
  /** Every LLM call of this client (payloads excluded), oldest last as listed by the call log. */
  calls: LlmCallSummary[];
  /** Every audit row of this client (code gates, apply_* steps, security events), oldest first. */
  steps: AdminConversationStep[];
}

/**
 * What the mail provider says about an accountant notification (openspec
 * `conversation-trace`): `blocked` = the outbound fence kept it in,
 * `unavailable` = an old row without a provider id, or the provider could not be asked.
 */
export type StepEmailStatus =
  | { status: 'delivered' | 'pending' | 'failed'; event: string }
  | { status: 'blocked' | 'unavailable' };

/** One audit row shown as a code step in the admin conversation timeline. */
export interface AdminConversationStep {
  id: string;
  occurredAt: string;
  actorType: 'agent' | 'admin' | 'accountant' | 'system';
  action: string;
  targetType: string | null;
  targetId: string | null;
  severity: 'info' | 'warning' | 'critical';
  suspectedInjection: boolean;
  detail: Record<string, unknown>;
  /** send_reply of a draft a replan discarded — the conversation endpoint flags it. */
  discarded?: boolean;
}

/** The received file a code step is about — what the step detail modal's document pane shows. */
export interface StepFile {
  id: string;
  filename: string;
  label: string | null;
  parentFileId: string | null;
  contentType: string;
}

/** One stage (purpose) of one app version on the admin versions page (openspec `cost-per-version`). */
export interface VersionStageSummary {
  purpose: string;
  calls: number;
  failed: number;
  cost: number;
  unpriced: number;
  avgCost: number;
  avgInputTokens: number;
  avgOutputTokens: number;
  cacheShare: number | null;
  avgCostDelta: number | null;
  avgInputTokensDelta: number | null;
}

/** One app version's figures; `version` null = the calls recorded before versions were stored. */
export interface VersionSummary {
  version: string | null;
  firstAt: string;
  lastAt: string;
  daysActive: number;
  calls: number;
  failed: number;
  cost: number;
  unpriced: number;
  cycles: number;
  documents: number;
  costPerCycle: number | null;
  costPerDocument: number | null;
  plannerCalls: number;
  plannerInputTokensAvg: number | null;
  costPerCycleDelta: number | null;
  costPerDocumentDelta: number | null;
  plannerInputTokensDelta: number | null;
  fewCalls: boolean;
  stages: VersionStageSummary[];
}

export type SiteHealth = 'no_data' | 'healthy' | 'warning' | 'failing';
export type SiteAccessOutcome = 'delivered' | 'failed' | 'no_documents' | 'abandoned' | 'in_progress';

/** One monitored site × product on the admin site-access screen (openspec `admin-site-access`). */
export interface SiteAccessEntry {
  site: string;
  product: string;
  nameHe: string;
  built: boolean;
  counts: { total: number; today: number; last7: number; last30: number };
  health: SiteHealth;
  last: { sessionId: string; at: string; outcome: SiteAccessOutcome; error: string | null } | null;
}

/** One recorded step of a website fetch's evidence gallery (openspec `fetch-step-evidence`). */
export interface FetchEvidenceStep {
  seq: number;
  name: string;
  parts: Array<'screenshot' | 'html' | 'mhtml' | 'record'>;
  at: string | null;
  url: string | null;
  title: string | null;
  error: string | null;
  missing: Record<string, string>;
  record: {
    frames: string[];
    console: Array<{ at: string; type: string; text: string }>;
    responses: Array<{ at: string; method: string; url: string; status: number | null; failure: string | null }>;
    sizes: Record<string, number>;
  } | null;
}

export interface FetchEvidenceReply {
  session: {
    id: string;
    clientId: string;
    provider: string;
    status: string;
    error: string | null;
    taxYear: number;
    createdAt: string;
    updatedAt: string;
    /** The route the session's browser used; null for sessions recorded before the field existed. */
    egress: { mode: 'direct' } | { mode: 'proxy'; host: string } | null;
  };
  steps: FetchEvidenceStep[];
}

export interface SiteAccessGroup {
  key: 'pension' | 'study_fund' | 'other';
  size: number;
  builtCount: number;
  totalAccesses: number;
  entries: SiteAccessEntry[];
}

export interface SiteAccessReply {
  groups: SiteAccessGroup[];
}

/** The admin fallbacks page (GET /admin/llm-fallbacks, openspec `fallbacks-dashboard`). */
export type FallbackDays = 7 | 30 | 90 | null;

export interface FallbackStageFigures {
  purpose: string;
  aimed: number;
  fellBack: number;
  share: number;
}

export interface FallbackModelCard {
  model: string;
  provider: string;
  /** Null for a model no call was aimed at in the period (backup-only). */
  primary: {
    aimed: number;
    fellBack: number;
    share: number;
    failedNoBackup: number;
    backupAnswered: number;
    backupFailed: number;
    byReason: { reason: string; calls: number }[];
    byStage: FallbackStageFigures[];
  } | null;
  /** Null for a model that took no fallback call in the period. */
  asBackup: { took: number; answered: number; fromModels: { model: string; calls: number }[] } | null;
}

export interface FallbacksReply {
  days: number | null;
  since: string | null;
  /** When the first marked backup row was made; null when no call fell back since the mark exists. */
  firstMarkedAt: string | null;
  /** The oldest call of the period; null when the period has no call. */
  oldestInPeriod: string | null;
  totals: { aimed: number; fellBack: number; share: number };
  models: FallbackModelCard[];
}

export interface VersionCostReply {
  versions: VersionSummary[];
  instances: { id: string; name: string | null; accountantEmail: string | null }[];
}

/** One LLM API call (payloads excluded — the list view). */
export interface LlmCallSummary {
  id: string;
  createdAt: string;
  userId: string | null;
  agentInstanceId: string | null;
  clientId: string | null;
  clientName: string | null;
  /** The received file the call read (splitting, classification, extraction); null for other calls and rows older than migration 059. */
  documentFileId: string | null;
  /** That file's stored name; null when the call read no file or the file is gone. */
  documentFileName: string | null;
  purpose: string;
  provider: string;
  model: string;
  status: 'ok' | 'error';
  error: string | null;
  attempts: number;
  durationMs: number | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  /** USD per single token at call time; null when the pricing feed had no entry. */
  inputPricePerToken: number | null;
  outputPricePerToken: number | null;
  thinkingPricePerToken: number | null;
  cachedPricePerToken: number | null;
  cost: number | null;
  /** The short git commit of the build that made the call; null on calls older than migration 078. */
  appVersion: string | null;
  /** The fallback mark: the primary model this backup call replaced and why; null on a call that was not a fallback. */
  fallbackFromModel: string | null;
  fallbackFromProvider: string | null;
  fallbackReason: string | null;
  /** planner whose draft a replan discarded — set only by the conversation endpoint. */
  discarded?: boolean;
}

/** One call with the exact request payload and the raw response (GET /admin/llm-calls/:id). */
export interface LlmCallDetail extends LlmCallSummary {
  request: {
    model?: string;
    systemInstruction?: string;
    contents?: unknown;
    /** The loop rule of a tool-call stage (the planner): the terminal tools and the turn cap (older rows: the closing tool). */
    continuation?: unknown;
    config?: Record<string, unknown>;
    /**
     * What the provider adapter actually sent, when it changed the request
     * (Anthropic, OpenAI; openspec `conversation-trace`): the schema or the
     * tools as received, the strict flag, the declared fields left out. Absent
     * for Gemini (sent as declared) and for rows older than the copy.
     */
    sent?: {
      provider: string;
      responseJsonSchema?: unknown;
      tools?: { name: string; description: string; parameters: unknown; strict: boolean }[];
      strict: boolean;
      omitted: string[];
    };
  };
  response: string | null;
  /**
   * The names behind the ids a tool-call answer mentions (openspec
   * `conversation-trace`): the client's checklist items and received files,
   * id → name. Empty maps for a call with no client; absent on older servers.
   */
  names?: { documents: Record<string, string>; files: Record<string, string> };
}

export interface LlmCallFilters {
  agentInstanceId?: string;
  clientId?: string;
  purpose?: string;
  model?: string;
  /** ISO instant — return calls strictly before it (keyset pagination). */
  before?: string;
  limit?: number;
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

/** One held model provider (openspec `llm-provider-outage`): why, since when, and the last probe. */
export interface ProviderHold {
  since: string;
  kind: string;
  message: string;
  model: string | null;
  lastProbeAt: string | null;
  lastError: string | null;
}

/** The open holds by provider (gemini | openai | anthropic | budget) and how many clients wait on them. */
export interface LlmOutageState {
  holds: Record<string, ProviderHold>;
  clientsWaiting: number;
}

export type OutageProbeOutcome =
  | { provider: string; result: 'recovered'; recovered: { clients: number; messages: number; files: number } }
  | { provider: string; result: 'still_failing'; error: string };

/** The platform-wide emergency stop: on = every agent is silenced at once. */
export interface KillSwitchState {
  on: boolean;
  updatedAt: string | null;
}

/** The Gemini model every LLM call runs on, for every accountant and client. */
/** One LLM stage as the code defines it (GET /admin/llm-stages): prompt templates with `{{placeholders}}`, query layout, schema, resolved model. */
export interface LlmStage {
  purpose: LlmCallPurpose;
  title: string;
  file: string;
  gate: string;
  model: string;
  provider: string;
  /** The backup model on another provider (openspec `llm-model-settings`), or null when the stage has none. */
  backupModel: string | null;
  backupProvider: string | null;
  temperature: number;
  placeholders: string[];
  /** `schema` is set when the variant has an answer schema of its own (the extraction stage: one per document type). */
  prompts: { variant: string; systemPrompt: string; schema?: Record<string, unknown> }[];
  query: { variant: string; parts: { kind: 'text' | 'binary'; body: string }[] }[];
  /** The answer schema of a stage that answers with one JSON object. */
  schema?: Record<string, unknown>;
  /** The tools of a stage that answers with tool calls (the planner): name, description, flat parameter schema. */
  tools?: LlmStageTool[];
  /** The loop rule of a tool-call stage: the tools whose accepted call ends the run and the cap on turns. */
  continuation?: { terminalTools: string[]; maxTurns: number };
}

export interface LlmStageTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** The LLM spend cap (GET/PUT /admin/llm-budget): daily USD ceilings (0 = unlimited) and today's priced spend. */
export interface LlmBudgetState {
  platformDailyUsd: number;
  instanceDailyUsd: number;
  spentTodayUsd: number;
}

/** The waits of the conversation, in seconds (openspec `admin-timing-settings`); each is the admin-saved value or the server default. */
export interface MessageTimingState {
  quietSeconds: number;
  maxWaitSeconds: number;
  afterSendDelaySeconds: number;
}

export interface GeminiModelState {
  model: string;
  /** True when set by an admin; false while running on the server's env default. */
  isCustom: boolean;
  updatedAt: string | null;
  /** Per-call-site default; null = follows the global model. */
  purposes: Record<LlmCallPurpose, string | null>;
  /** Per-call-site backup model on another provider; null = none (openspec `llm-model-settings`). */
  backups: Record<LlmCallPurpose, string | null>;
  options: string[];
}

/** A Twilio-owned (billed) number not assigned to any agent instance here. */
export interface OrphanedWaNumber {
  phoneNumber: string;
  friendlyName: string;
  dateCreated: string;
  /** Its Twilio name records an agent of another environment (prod/sandbox/dev share the account): never selectable here. */
  claimedElsewhere: boolean;
  owner: { agentType: string; instanceId: string } | null;
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

/** The accountant's own WhatsApp Business Account (Settings → Integrations). */
export interface WaBusinessStatus {
  connected: boolean;
  wabaId: string | null;
  source: 'embedded_signup' | 'manual' | null;
  connectedAt: string | null;
  /** Meta Embedded Signup popup config; { configured: false } means manual entry only. */
  embeddedSignup: { configured: true; appId: string; configId: string } | { configured: false };
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
  /** Requested scopes the stored token lacks; non-empty → "update permissions" notice. */
  missingScopes: string[];
  /** The app's fixed install page on monday (step 1 of the notice); null when no client id. */
  installUrl: string | null;
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

/** Client-import sources config (doc collector; agent_instances.settings). */
export interface ClientSourcesConfig {
  boards: {
    boardId: string;
    /** Row key of email-keyed agents; WhatsApp-only agents key by phoneColumnId instead. */
    emailColumnId?: string;
    nameColumnId?: string;
    phoneColumnId?: string;
    idNumberColumnId?: string;
    taxUserCodeColumnId?: string;
    documentsColumnId?: string;
    /** Status column mirroring the client dot's color (documents status). */
    documentsStatusColumnId?: string;
    /** Declaration of capital: connect-boards link to the client's CRM item. */
    crmLinkColumnId?: string;
    /** Declaration of capital: connect-boards link to the submitted questionnaire item. */
    formLinkColumnId?: string;
    /** Declaration of capital: the tax-office file number column. */
    fileNumberColumnId?: string;
    /** Declaration of capital: the declaration-year column. */
    yearColumnId?: string;
    /** Declaration of capital: the people column naming the client's tax advisor. */
    taxAdvisorColumnId?: string;
    boardName?: string;
    /** Set when the source is added; the server clears it after a clean import scan. */
    pendingImport?: boolean;
  }[];
  sheets: {
    spreadsheetId: string;
    spreadsheetName?: string;
    sheetTitle: string;
    /** Row key of email-keyed agents; WhatsApp-only agents key by phoneColumn instead. */
    emailColumn?: string;
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
  notReady: 'no_sources' | 'no_mailbox' | 'no_documents' | 'no_wa_sender' | 'no_phone_column' | null;
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
  /** Admin listing only: the WhatsApp display name submitted when the platform bought the number; null for a hand-assigned one. */
  waDisplayName?: string | null;
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
  /** Admin listing only: true when the agent type starts a collection window at first contact. */
  collectionWindowCapable?: boolean;
  /** Admin listing only: days the agent chases a client after its first delivered message (default 14). */
  collectionWindowDays?: number;
  /** Admin listing only: true for manual-kickoff agent types (the first-message approval setting applies). */
  firstMessageApprovalCapable?: boolean;
  /** Admin listing only: on = new clients enroll paused with a held first message; off = they start right away. */
  firstMessageApproval?: boolean;
  /** Admin listing only: pilot supervision — outbound messages need admin approval (declaration_of_capital). */
  reviewMode?: boolean;
  /** Admin listing only: the hidden admin emergency brake (declaration_of_capital). */
  adminPaused?: boolean;
  /** Admin listing only: the agent's own uploaded icon, null when it falls back to the app logo / default. */
  logoUrl?: string | null;
  /** Admin listing only: the picture the WhatsApp sender actually shows and which level it comes from. */
  effectivePicture?: EffectivePicture;
}

/** One of the three picture levels: the agent's own icon, the admin-uploaded app logo, the built-in default. */
export interface EffectivePicture {
  url: string;
  level: 'agent' | 'app' | 'default';
}

/** GET/PUT/DELETE /admin/app-logo. */
export interface AppLogoState {
  /** The uploaded app logo, null = the built-in default. */
  logoUrl: string | null;
  defaultLogoUrl: string;
  /** Present after an upload/removal: senders without an own icon that took the new picture / failed. */
  sendersUpdated?: number;
  sendersFailed?: number;
}

/** PUT/DELETE /admin/agents/:id/logo. */
export interface AgentLogoState {
  logoUrl: string | null;
  effectivePicture: EffectivePicture;
  /** null = the agent has no WhatsApp number; false = saved, but Twilio refused the profile update. */
  waProfileUpdated: boolean | null;
}

/** One draft awaiting admin approval (GET /admin/review/messages). */
export interface ReviewMessage {
  id: string;
  clientId: string;
  clientName: string;
  clientAdminPaused: boolean;
  agentInstanceId: string | null;
  agentType: string | null;
  instanceName: string | null;
  accountantEmail: string | null;
  accountantName: string | null;
  channel: 'email' | 'whatsapp';
  isTemplate: boolean;
  body: string;
  reasoning: string | null;
  createdAt: string;
  heldAt: string | null;
  scheduledFor: string | null;
  /** The send time passed unapproved — approval now sends immediately. */
  pastDue: boolean;
}

/** Per-type email facts for the admin agent page — covers types with no instance yet. */
export interface AgentTypeEmailInfo {
  emailCapable: boolean;
  suggestedEmailLocalPart: string | null;
  taxYearCapable: boolean;
}

/** What the admin's advisor re-read reports: one count per outcome, per client of the agent. */
export interface TaxAdvisorBackfillResult {
  updated: number;
  cleared: number;
  unchanged: number;
  skipped: number;
  failed: number;
}

/** The body of the admin's test-client form (declaration of capital): the identity the monday kickoff would read. */
export interface TestClientInput {
  name: string;
  phone: string;
  taxYear: number;
  idNumber?: string | null;
  fileNumber?: string | null;
  maritalStatus?: 'married' | 'not_married' | null;
  spouseName?: string | null;
  spouseIdNumber?: string | null;
  formAnswers?: { question: string; answer: string }[];
}

/** The agent-workspace endpoints of one agent instance, rooted at `/agents/<id>`. */
function makeWorkspaceApi(prefix: string) {
  return {
    dashboard: (opts?: RequestOpts) => request<DashboardSummary>(`${prefix}/dashboard`, undefined, opts),
    listClients: (opts?: RequestOpts) => request<{ clients: Client[] }>(`${prefix}/clients`, undefined, opts),
    /** The instance's deleted clients — an admin viewing as only (403 otherwise). */
    listDeletedClients: (opts?: RequestOpts) =>
      request<{ clients: Client[] }>(`${prefix}/clients?deleted=1`, undefined, opts),
    createClient: (args: {
      name: string;
      email: string;
      /** Optional; any usable number turns the WhatsApp channel on by default. */
      phone?: string | null;
      documents: { name: string; description?: string | null }[];
      /** Optional collection deadline ("YYYY-MM-DD"); the agent paces follow-ups toward it. */
      dueDate?: string | null;
    }) => request<{ client: Client }>(`${prefix}/clients`, { method: 'POST', body: JSON.stringify(args) }),
    /** The admin's hand-filled test client (openspec `admin-test-client`) — an admin viewing as only (403 otherwise). */
    createTestClient: (args: TestClientInput) =>
      request<{ client: Client }>(`${prefix}/clients/test`, { method: 'POST', body: JSON.stringify(args) }),
    /** Re-reads the advisor cell of every remembered monday row (openspec `client-tax-advisor`) — an admin viewing as only (403 otherwise, 409 without a monday connection). */
    backfillTaxAdvisors: () =>
      request<TaxAdvisorBackfillResult>(`${prefix}/clients/tax-advisor-backfill`, { method: 'POST' }),
    getClient: (id: string, opts?: RequestOpts) =>
      request<{ client: Client; nextScheduled: NextScheduled | null; planWaitUntil?: string | null; documents: ClientDocument[]; teamQuestions?: TeamQuestion[] }>(
        `${prefix}/clients/${id}`,
        undefined,
        opts,
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
    listEmails: (clientId: string, opts?: RequestOpts) =>
      request<{ emails: Email[] }>(`${prefix}/clients/${clientId}/emails`, undefined, opts),
    sendScheduledNow: (clientId: string) =>
      request<{ ok: true }>(`${prefix}/clients/${clientId}/send-now`, { method: 'POST' }),
    setPaused: (clientId: string, paused: boolean) =>
      request<{ client: Client }>(`${prefix}/clients/${clientId}/pause`, { method: 'PUT', body: JSON.stringify({ paused }) }),
    /** Sets or clears the collection due date; editing it un-stops an overdue-stopped client. */
    setDueDate: (clientId: string, dueDate: string | null) =>
      request<{ client: Client }>(`${prefix}/clients/${clientId}/due-date`, {
        method: 'PUT',
        body: JSON.stringify({ dueDate }),
      }),
    retryDraft: (clientId: string) => request<{ ok: true }>(`${prefix}/clients/${clientId}/redraft`, { method: 'POST' }),
    /** Closes a question the agent asked the team (openspec `team-questions`): an answer to relay, or "I answered the client myself" with an optional note. */
    closeTeamQuestion: (clientId: string, questionId: string, how: 'answered' | 'handled_outside', text: string) =>
      request<{ question: TeamQuestion }>(`${prefix}/clients/${clientId}/team-questions/${questionId}/close`, {
        method: 'POST',
        body: JSON.stringify({ how, text }),
      }),
    /** Re-fires a scheduled send whose attempt failed, keeping the same draft. */
    retrySend: (clientId: string) => request<{ ok: true }>(`${prefix}/clients/${clientId}/retry-send`, { method: 'POST' }),
    listFiles: (clientId: string, opts?: RequestOpts) =>
      request<{ files: DocumentFile[] }>(`${prefix}/clients/${clientId}/files`, undefined, opts),
    /** Async because the monday transport appends a freshly fetched ?sessionToken=. */
    fileDownloadUrl: (clientId: string, fileId: string) =>
      tokenizedUrl(`${prefix}/clients/${clientId}/files/${fileId}/download`),
    /** One zip with all of the client's files (the "download all" button). */
    filesZipUrl: (clientId: string) => tokenizedUrl(`${prefix}/clients/${clientId}/files.zip`),
    /** Inline-disposition variant for the in-app viewer modal (iframe/img src). */
    fileViewUrl: (clientId: string, fileId: string) =>
      tokenizedUrl(`${prefix}/clients/${clientId}/files/${fileId}/view`),
    eventsUrl: (clientId: string) => tokenizedUrl(`${prefix}/clients/${clientId}/events`),
    /** SSE ticks when this instance's client roster changes — the sidebar refetches the list. */
    clientsEventsUrl: () => tokenizedUrl(`${prefix}/events`),
    // Client-import sources.
    sourcesGetSettings: () =>
      request<{
        settings: ClientSourcesConfig;
        mondayConnected: boolean;
        googleConnected: boolean;
        /** Manual-kickoff agents only: the monday webhook URL that starts a board row's conversation. */
        kickoffWebhookUrl?: string;
      }>(`${prefix}/client-sources/settings`),
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

/** One employee on the accountant's staff list (openspec `accountant-employee-access`). */
export interface StaffEntry {
  id: string;
  email: string;
  /** Whether that person has signed in with Google at least once. */
  signedIn: boolean;
  createdAt: string;
}

/** Why an address could not be added to the staff list (POST /staff 409 codes). */
export type StaffAddRefusal = 'own_email' | 'admin_email' | 'accountant_email' | 'other_accountants_staff' | 'duplicate';

export const api = {
  me: () => request<Me>('/me'),
  listStaff: () => request<{ staff: StaffEntry[] }>('/staff'),
  addStaff: (email: string) =>
    request<{ entry: StaffEntry }>('/staff', { method: 'POST', body: JSON.stringify({ email }) }),
  removeStaff: (id: string) => request<{ ok: true }>(`/staff/${id}`, { method: 'DELETE' }),
  logout: () => request<{ ok: true }>('/logout', { method: 'POST' }),
  listAgents: () => request<{ agents: AgentInstance[] }>('/agents'),
  mailboxStatus: () => request<MailboxStatus>('/mailbox'),
  mondayConnection: () => request<MondayConnection>('/monday-connection'),
  mondayConnectUrl: () => request<{ url: string }>('/monday-connection/url'),
  mondayDisconnect: () => request<{ ok: true }>('/monday-connection', { method: 'DELETE' }),
  waBusiness: () => request<WaBusinessStatus>('/wa-business'),
  waBusinessConnect: (wabaId: string, source: 'embedded_signup' | 'manual') =>
    request<{ connected: true; wabaId: string }>('/wa-business', {
      method: 'POST',
      body: JSON.stringify({ wabaId, source }),
    }),
  waBusinessDisconnect: () => request<{ ok: true }>('/wa-business', { method: 'DELETE' }),
  googleConnection: () => request<GoogleConnection>('/google-connection'),
  googleConnectUrl: () => request<{ url: string }>('/google-connection/url'),
  googleDisconnect: () => request<{ ok: true }>('/google-connection', { method: 'DELETE' }),
  googlePickerConfig: () => request<GooglePickerConfig>('/google-connection/picker'),
  adminListAccountants: () => request<{ accountants: Accountant[] }>('/admin/accountants'),
  adminGetVersionCost: (filters: { agentInstanceId?: string; clients?: 'all' | 'live' | 'test' }) => {
    const qs = new URLSearchParams();
    if (filters.agentInstanceId && filters.agentInstanceId !== 'all') qs.set('agentInstanceId', filters.agentInstanceId);
    if (filters.clients && filters.clients !== 'all') qs.set('clients', filters.clients);
    const q = qs.toString();
    return request<VersionCostReply>(`/admin/version-cost${q ? `?${q}` : ''}`);
  },
  adminGetLlmFallbacks: (days: FallbackDays) => request<FallbacksReply>(`/admin/llm-fallbacks${days ? `?days=${days}` : ''}`),
  adminSiteAccess: () => request<SiteAccessReply>('/admin/site-access'),
  /** A website fetch's step evidence (404 for an unknown session; empty steps when none was kept). */
  adminFetchEvidence: (sessionId: string) => request<FetchEvidenceReply>(`/admin/document-fetch/${sessionId}/evidence`),
  /** Same-origin URLs of one evidence file (admin pages never run inside monday, so no ?sessionToken=). */
  adminFetchEvidenceUrl: (sessionId: string, seq: number, part: 'screenshot' | 'html' | 'mhtml' | 'record', as: 'view' | 'download') =>
    `${transport.basePath}/admin/document-fetch/${sessionId}/evidence/${seq}/${part}?as=${as}`,
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
  adminSetAgentCollectionWindow: (agentInstanceId: string, days: number) =>
    request<{ days: number }>('/admin/agent-collection-window', {
      method: 'POST',
      body: JSON.stringify({ agentInstanceId, days }),
    }),
  adminListReviewMessages: () => request<{ messages: ReviewMessage[] }>('/admin/review/messages'),
  adminReviewCount: () => request<{ pendingCount: number }>('/admin/review/count'),
  adminApproveReviewMessage: (emailId: string) =>
    request<{ ok: true; sentImmediately: boolean }>(`/admin/review/messages/${emailId}/approve`, { method: 'POST' }),
  adminRegenerateReviewMessage: (emailId: string) =>
    request<{ ok: true }>(`/admin/review/messages/${emailId}/regenerate`, { method: 'POST' }),
  adminSetAgentFirstMessageApproval: (agentInstanceId: string, on: boolean) =>
    request<{ on: boolean }>('/admin/agent-first-message-approval', {
      method: 'POST',
      body: JSON.stringify({ agentInstanceId, on }),
    }),
  adminSetAgentReviewMode: (agentInstanceId: string, reviewMode: boolean) =>
    request<{ reviewMode: boolean }>('/admin/agent-review-mode', {
      method: 'POST',
      body: JSON.stringify({ agentInstanceId, reviewMode }),
    }),
  adminSetAgentAdminPause: (agentInstanceId: string, paused: boolean) =>
    request<{ paused: boolean }>('/admin/agent-admin-pause', {
      method: 'POST',
      body: JSON.stringify({ agentInstanceId, paused }),
    }),
  adminSetClientAdminPause: (clientId: string, paused: boolean) =>
    request<{ paused: boolean }>(`/admin/clients/${clientId}/admin-pause`, {
      method: 'POST',
      body: JSON.stringify({ paused }),
    }),
  adminListInstanceClients: (agentInstanceId: string) =>
    request<{ clients: AdminClient[] }>(`/admin/agents/${agentInstanceId}/clients`),
  adminGetClientConversation: (clientId: string, opts?: RequestOpts) =>
    request<AdminConversation>(`/admin/clients/${clientId}/conversation`, undefined, opts),
  /** Every LLM call of one client, payloads excluded — the admin cost tab (openspec `admin-cost-tab`). */
  adminGetClientLlmCalls: (clientId: string, opts?: RequestOpts) =>
    request<{ calls: LlmCallSummary[] }>(`/admin/clients/${clientId}/llm-calls`, undefined, opts),
  /** What became of the instance's outbound drafts in a day range — the admin analytics tab (openspec `discarded-message-analytics`). */
  adminGetMessageAnalytics: (agentInstanceId: string, range: { from?: string; to?: string }) => {
    const qs = new URLSearchParams();
    if (range.from) qs.set('from', range.from);
    if (range.to) qs.set('to', range.to);
    const q = qs.toString();
    return request<MessageAnalytics>(`/admin/agents/${agentInstanceId}/message-analytics${q ? `?${q}` : ''}`);
  },
  /** What the instance's LLM spend bought in settled checklist items — the admin documents tab (openspec `document-cost-analytics`). */
  adminGetDocumentCost: (agentInstanceId: string, filters: { clients: 'all' | 'live' | 'test'; completed: boolean }) => {
    const qs = new URLSearchParams({ clients: filters.clients, completed: filters.completed ? '1' : '0' });
    return request<DocumentCost>(`/admin/agents/${agentInstanceId}/document-cost?${qs.toString()}`);
  },
  /** One code step by id — the step link (#/steps/:id). */
  adminGetStep: (stepId: string) => request<{ step: AdminConversationStep }>(`/admin/audit-events/${stepId}`),
  /** The received file a step checked (404 when the step is not about a file, or the file is gone). */
  adminGetStepFile: (stepId: string) => request<{ file: StepFile }>(`/admin/audit-events/${stepId}/file`),
  /** Delivery status of an accountant-email step, read live from the mail provider (404 for any other step). */
  adminGetStepEmailStatus: (stepId: string) => request<StepEmailStatus>(`/admin/audit-events/${stepId}/email-status`),
  /** Plain same-origin URLs (cookie session): admin pages never run inside monday, so no ?sessionToken=. */
  adminStepFileViewUrl: (stepId: string) => `${transport.basePath}/admin/audit-events/${stepId}/file/view`,
  adminStepFileDownloadUrl: (stepId: string) => `${transport.basePath}/admin/audit-events/${stepId}/file/download`,
  adminListLlmCalls: (filters: LlmCallFilters) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value !== undefined && value !== '') params.set(key, String(value));
    }
    const qs = params.toString();
    return request<{ calls: LlmCallSummary[]; nextBefore: string | null }>(`/admin/llm-calls${qs ? `?${qs}` : ''}`);
  },
  adminListLlmStages: () => request<{ stages: LlmStage[] }>('/admin/llm-stages'),
  adminGetLlmCall: (id: string) => request<{ call: LlmCallDetail }>(`/admin/llm-calls/${id}`),
  /** The file an LLM call read, by call id — the call-keyed twins of the step file helpers above. */
  adminGetCallFile: (callId: string) => request<{ file: StepFile }>(`/admin/llm-calls/${callId}/file`),
  adminCallFileViewUrl: (callId: string) => `${transport.basePath}/admin/llm-calls/${callId}/file/view`,
  adminCallFileDownloadUrl: (callId: string) => `${transport.basePath}/admin/llm-calls/${callId}/file/download`,
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
  adminProvisionWaSender: (agentInstanceId: string, displayName: string) =>
    request<{ sender: { agentInstanceId: string; phoneNumber: string; displayName: string | null }; senderStatus: string }>(
      '/admin/wa-senders/provision',
      { method: 'POST', body: JSON.stringify({ agentInstanceId, displayName }) },
    ),
  /** The WhatsApp display name the buy step prefills ("<accountant name> by FiscalMind"). */
  adminGetWaDisplayNameDefault: (agentInstanceId: string) =>
    request<{ displayName: string }>(`/admin/wa-senders/${agentInstanceId}/display-name-default`),
  adminGetWaSenderStatus: (agentInstanceId: string) =>
    request<AdminWaSenderStatus>(`/admin/wa-senders/${agentInstanceId}/status`),
  adminDeleteWaSender: (agentInstanceId: string) =>
    request<{ ok: true }>(`/admin/wa-senders/${agentInstanceId}`, { method: 'DELETE' }),
  adminReleaseWaSender: (agentInstanceId: string) =>
    request<{ ok: true }>(`/admin/wa-senders/${agentInstanceId}/release`, { method: 'POST' }),
  adminListOrphanedWaNumbers: () => request<{ numbers: OrphanedWaNumber[] }>('/admin/wa-numbers/orphaned'),
  // Sender pictures: the file goes up as the raw body with its own MIME type
  // (the server checks the bytes, not the header).
  adminGetAppLogo: () => request<AppLogoState>('/admin/app-logo'),
  adminUploadAppLogo: (file: File) => uploadImage<AppLogoState>('/admin/app-logo', file),
  adminDeleteAppLogo: () => request<AppLogoState>('/admin/app-logo', { method: 'DELETE' }),
  adminUploadAgentLogo: (agentInstanceId: string, file: File) =>
    uploadImage<AgentLogoState>(`/admin/agents/${agentInstanceId}/logo`, file),
  adminDeleteAgentLogo: (agentInstanceId: string) =>
    request<AgentLogoState>(`/admin/agents/${agentInstanceId}/logo`, { method: 'DELETE' }),
  adminReleaseOrphanedWaNumber: (phoneNumber: string) =>
    request<{ ok: true }>('/admin/wa-numbers/release', { method: 'POST', body: JSON.stringify({ phoneNumber }) }),
  adminGetLlmBudget: () => request<LlmBudgetState>('/admin/llm-budget'),
  adminSetLlmBudget: (budget: { platformDailyUsd: number; instanceDailyUsd: number }) =>
    request<LlmBudgetState>('/admin/llm-budget', { method: 'PUT', body: JSON.stringify(budget) }),
  adminGetMessageTiming: () => request<MessageTimingState>('/admin/message-timing'),
  adminSetMessageTiming: (timing: MessageTimingState) =>
    request<MessageTimingState>('/admin/message-timing', { method: 'PUT', body: JSON.stringify(timing) }),
  adminGetModel: () => request<GeminiModelState>('/admin/model'),
  adminSetModel: (model: string) =>
    request<GeminiModelState>('/admin/model', { method: 'PUT', body: JSON.stringify({ model }) }),
  adminSetPurposeModel: (purpose: LlmCallPurpose, model: string | null) =>
    request<GeminiModelState>('/admin/model/purpose', { method: 'PUT', body: JSON.stringify({ purpose, model }) }),
  adminSetPurposeBackupModel: (purpose: LlmCallPurpose, model: string | null) =>
    request<GeminiModelState>('/admin/model/purpose/backup', { method: 'PUT', body: JSON.stringify({ purpose, model }) }),
  adminGetKillSwitch: () => request<KillSwitchState>('/admin/kill-switch'),
  adminGetLlmOutage: () => request<LlmOutageState>('/admin/llm-outage'),
  adminProbeLlmOutage: () => request<LlmOutageState & { outcomes: OutageProbeOutcome[] }>('/admin/llm-outage/probe', { method: 'POST' }),
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
};
