import * as agentInstances from '../../db/queries/agentInstances.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as clientPortalCredentials from '../../db/queries/clientPortalCredentials.js';
import * as clients from '../../db/queries/clients.js';
import * as waSenders from '../../db/queries/waSenders.js';
import { draftFirstEmail } from '../../api/draftFirstEmail.js';
import { recordAudit } from '../../audit/audit.js';
import { publishInstanceClientsUpdated } from '../../events/clientEvents.js';
import { resolveSenderMailbox } from '../instanceEmail.js';
import { isKillSwitchOn } from '../killSwitch.js';
import { getAgentTypeIfKnown } from '../registry.js';
import { normalizeE164 } from '../../util/phone.js';
import { syntheticWaEmail } from '../../util/syntheticEmail.js';
import { logger } from '../../util/logger.js';
import type { AgentInstanceRow } from '../../db/types.js';
import { DOC_COLLECTOR_FAMILY, isDocCollectorFamily } from '../docCollector/family.js';
import { parseSettings as parseDocCollectorSettings } from '../docCollector/settings.js';
import {
  collectCandidates,
  hasCrmLinkColumn,
  hasDocumentsColumn,
  hasPhoneColumn,
  loadAllRows,
  parseClientSources,
  parseDocumentsCell,
  type Candidate,
  type ClientSources,
  type PortalCredentials,
} from './clientSources.js';

/** Agent types whose clients are auto-enrolled from the configured sources (every row, no screening). */
export const CLIENT_IMPORT_AGENT_TYPES = [...DOC_COLLECTOR_FAMILY] as const;

/** New clients enrolled per instance per run — keeps a huge board from flooding the send pipeline. */
const MAX_ENROLL = 500;

/** Spacing between the enrolled clients' first-draft kicks (same rationale as the monday-widget import). */
const DRAFT_STAGGER_MS = 1500;

export interface SourceScanResult {
  enrolled: number;
  /** Candidate emails that already have a client in this instance. */
  skipped: number;
  /** Sources that were configured but could not be read this run. */
  failedSources: string[];
  /** Why enrollment could not run at all; null when the scan ran. */
  notReady: 'no_sources' | 'no_mailbox' | 'no_documents' | 'no_wa_sender' | 'no_phone_column' | null;
}

/** Narrows a scan to one configured source — the settings panel's per-source "import now". */
export type ScanSourceFilter = { boardId: string } | { spreadsheetId: string; sheetTitle: string };

function matchesFilter(entry: Record<string, unknown>, filter: ScanSourceFilter): boolean {
  return 'boardId' in filter
    ? entry.boardId === filter.boardId
    : entry.spreadsheetId === filter.spreadsheetId && entry.sheetTitle === filter.sheetTitle;
}

function filterSources(sources: ClientSources, filter: ScanSourceFilter): ClientSources {
  return {
    boards: sources.boards.filter((b) => matchesFilter(b, filter)),
    sheets: sources.sheets.filter((s) => matchesFilter(s, filter)),
  };
}

interface InstanceImportConfig {
  sources: ClientSources;
  /** Doc-collector family only: a mapped documents column supplies each client's checklist. */
  perRowDocuments: boolean;
  /** Config gap that must block enrollment (beyond having no sources). */
  notReady: 'no_documents' | 'no_phone_column' | null;
}

/** Best-effort: a bad credentials cell must not block enrollment of the client itself. */
async function syncCredentials(clientId: string, credentials: PortalCredentials | null): Promise<void> {
  if (!credentials) return;
  try {
    await clientPortalCredentials.upsert({
      clientId,
      provider: 'israel_tax_authority',
      idNumber: credentials.idNumber,
      userCode: credentials.userCode,
    });
  } catch (err) {
    logger.error('client import: credentials upsert failed', err, { clientId });
  }
}

/**
 * Each newly added source carries pendingImport=true, which keeps the settings
 * panel's per-source "import now" prompt visible. Once a scan has read a
 * source, its prompt has served its purpose — strip the flag from the stored
 * settings (raw JSONB edit so agent-specific keys survive untouched). A
 * filtered scan only vouches for the source it read, so it only clears that one.
 */
async function clearPendingImportFlags(instance: AgentInstanceRow, filter?: ScanSourceFilter): Promise<void> {
  let changed = false;
  const strip = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((entry) => {
          if (
            entry !== null &&
            typeof entry === 'object' &&
            'pendingImport' in entry &&
            (!filter || matchesFilter(entry as Record<string, unknown>, filter))
          ) {
            changed = true;
            const { pendingImport: _drop, ...rest } = entry as Record<string, unknown>;
            return rest;
          }
          return entry;
        })
      : list;
  const next = { ...instance.settings, boards: strip(instance.settings.boards), sheets: strip(instance.settings.sheets) };
  if (!changed) return;
  try {
    await agentInstances.updateSettings(instance.id, next as Record<string, unknown>);
  } catch (err) {
    logger.error('client import: clearing pending-import flags failed', err, { instanceId: instance.id });
  }
}

function importConfig(instance: AgentInstanceRow, filter?: ScanSourceFilter): InstanceImportConfig {
  const definition = getAgentTypeIfKnown(instance.agent_type);
  if (isDocCollectorFamily(instance.agent_type)) {
    const settings = parseDocCollectorSettings(instance.settings);
    const sources = filter ? filterSources(settings, filter) : settings;
    // WhatsApp-only agents key rows by phone — a source without a mapped phone
    // column can only produce unreachable clients, so enrollment refuses. A
    // board mapped by its CRM connect-boards column is exempt: its phone lives
    // on the linked CRM item and enrollment happens at kickoff (form
    // submission), not in this sweep.
    const missingPhoneKey =
      definition?.whatsappOnly === true && !hasPhoneColumn(sources) && !hasCrmLinkColumn(sources)
        ? ('no_phone_column' as const)
        : null;
    // Catalog-seeded types (declaration of capital) take no per-row checklist:
    // the hardcoded catalog is the only supply, so the documents column is
    // ignored and enrollment never blocks on it.
    if (definition?.seedClientDocuments) {
      return { sources, perRowDocuments: false, notReady: missingPhoneKey };
    }
    // A doc-collector client without documents completes trivially and never
    // gets emailed — refuse to mass-create useless clients. The mapped
    // documents column (of the scanned sources) is the only supply of a
    // client's checklist.
    const perRowDocuments = hasDocumentsColumn(sources);
    return { sources, perRowDocuments, notReady: perRowDocuments ? null : 'no_documents' };
  }
  const sources = parseClientSources(instance.settings);
  return { sources: filter ? filterSources(sources, filter) : sources, perRowDocuments: false, notReady: null };
}

/**
 * The checklist an enrolled client starts with: the row's documents cell
 * (doc-collector family only — other client-import agents track no documents).
 */
function resolveDocuments(config: InstanceImportConfig, candidate: Candidate): { name: string }[] {
  if (!config.perRowDocuments) return [];
  return parseDocumentsCell(candidate.documentsCell).map((name) => ({ name }));
}

/**
 * Enrolls every not-yet-known row of the instance's configured boards/sheets
 * as a client (name+email; doc collector adds its checklist) and kicks the
 * staggered first drafts. Existing clients are skipped, so re-runs and the
 * daily sweep are idempotent. Also serves the settings panel's per-source
 * "import now" — `filter` narrows the sweep to that one board/sheet.
 */
export async function scanClientImportInstance(
  instance: AgentInstanceRow,
  filter?: ScanSourceFilter,
): Promise<SourceScanResult> {
  const config = importConfig(instance, filter);
  const result: SourceScanResult = { enrolled: 0, skipped: 0, failedSources: [], notReady: null };

  if (config.sources.boards.length === 0 && config.sources.sheets.length === 0) {
    result.notReady = 'no_sources';
    return result;
  }
  if (config.notReady) {
    result.notReady = config.notReady;
    return result;
  }
  const definition = getAgentTypeIfKnown(instance.agent_type);
  const whatsappOnly = definition?.whatsappOnly === true;
  if (whatsappOnly) {
    // WhatsApp-only agents send from the instance's dedicated number; without
    // one the first message could never send — same rationale as the mailbox.
    if (!(await waSenders.getByInstanceId(instance.id))) {
      logger.warn('client import: instance has no WhatsApp sender, skipping', { instanceId: instance.id });
      result.notReady = 'no_wa_sender';
      return result;
    }
  } else if (!(await resolveSenderMailbox(instance.id, instance.user_id))) {
    // Without a sender address the first email could never send; skip rather
    // than enroll clients that immediately fail.
    logger.warn('client import: instance has no sender address, skipping', { instanceId: instance.id });
    result.notReady = 'no_mailbox';
    return result;
  }

  const { sources, failedSources } = await loadAllRows(instance.user_id, config.sources);
  result.failedSources = failedSources;
  if (failedSources.length > 0) {
    logger.warn('client import: some sources unreadable this run', { instanceId: instance.id, failedSources });
  }

  const candidates = collectCandidates(sources, whatsappOnly ? 'phone' : 'email');
  const fresh = [];
  for (const [key, candidate] of candidates.entries()) {
    // WhatsApp-only agents: the map key IS the E.164 phone — the client identity.
    const existing = whatsappOnly
      ? await clients.getByWaPhoneForInstance(instance.id, key)
      : await clients.getByEmailAddressForInstance(instance.id, candidate.email);
    if (existing) {
      result.skipped += 1;
      // Credentials/phone keep syncing for already-enrolled clients — this is
      // how a later-filled source column reaches them without re-import.
      await syncCredentials(existing.id, candidate.credentials);
      // Backfill the board-row address of clients enrolled before the status
      // sync existed, so their progress labels reach the board too.
      if (candidate.mondayItem && typeof existing.agent_fields['monday_item_id'] !== 'string') {
        await clients
          .setMondayItem(existing.id, candidate.mondayItem.boardId, candidate.mondayItem.itemId)
          .catch((err) => logger.error('client import: monday item backfill failed', err, { clientId: existing.id }));
      }
      if (!existing.phone && candidate.phone) {
        await clients
          .updateDetailsForInstance(existing.id, instance.id, { phone: candidate.phone })
          .catch((err) => logger.error('client import: phone backfill failed', err, { clientId: existing.id }));
      }
      // WhatsApp is on by default — open the channel for clients that predate
      // that or whose phone column was filled in after enrollment. Opt-outs
      // and already-stored numbers are left alone (autoEnableWhatsApp guards).
      const waPhone = normalizeE164(candidate.phone || existing.phone || '');
      if (waPhone && !existing.wa_phone) {
        await clients
          .autoEnableWhatsApp(existing.id, waPhone)
          .catch((err) => logger.error('client import: whatsapp auto-enable failed', err, { clientId: existing.id }));
      }
    } else {
      fresh.push(candidate);
    }
  }
  if (fresh.length > MAX_ENROLL) {
    logger.warn('client import: candidates truncated', { instanceId: instance.id, total: fresh.length, kept: MAX_ENROLL });
    fresh.length = MAX_ENROLL;
  }

  // Manual-kickoff agents (declaration of capital) enroll paused with no
  // first draft: outreach starts only on the accountant's explicit trigger
  // (monday kickoff webhook or the workspace resume toggle).
  const manualKickoff = definition?.manualKickoff === true;
  // Catalog-seeded types (declaration of capital) enroll ONLY via the monday
  // kickoff webhook: their checklist is rendered for the board row's own
  // declaration year (per client), which this sweep cannot see. New rows are
  // left for the kickoff; the existing-client backfills above still ran.
  if (definition?.seedClientDocuments && fresh.length > 0) {
    logger.info('client import: catalog-seeded type — new rows are enrolled by the kickoff webhook, skipping', {
      instanceId: instance.id,
      rows: fresh.length,
    });
    result.skipped += fresh.length;
    fresh.length = 0;
  }

  for (const candidate of fresh) {
    // WhatsApp-only agents: the phone is the identity; email_address gets the
    // synthetic placeholder (the column is NOT NULL + unique per instance).
    const waPhone = whatsappOnly ? normalizeE164(candidate.phone) : null;
    if (whatsappOnly && !waPhone) continue; // phone-keyed candidates always normalize; defensive
    const name =
      candidate.name || (whatsappOnly ? (waPhone as string) : candidate.email.split('@')[0] || candidate.email);
    const documents = resolveDocuments(config, candidate);
    if (config.perRowDocuments && documents.length === 0) {
      // Empty checklist + empty cell: this client would complete trivially.
      // Leave the row for a later sweep, once its documents cell is filled.
      logger.info('client import: row has no documents yet, skipping', { instanceId: instance.id, email: candidate.email });
      result.skipped += 1;
      continue;
    }
    try {
      const client = await clients.insert({
        userId: instance.user_id,
        agentInstanceId: instance.id,
        name,
        emailAddress: waPhone ? syntheticWaEmail(waPhone) : candidate.email,
        phone: candidate.phone || null,
        // The board-row address for the status sync's write-back.
        agentFields: candidate.mondayItem
          ? { monday_board_id: candidate.mondayItem.boardId, monday_item_id: candidate.mondayItem.itemId }
          : undefined,
        paused: manualKickoff,
      });
      for (const doc of documents) {
        await clientDocuments.insert({ clientId: client.id, name: doc.name, description: null });
      }
      await syncCredentials(client.id, candidate.credentials);
      // Same fire-and-forget first-draft path as manual client creation,
      // staggered so a big import doesn't fire hundreds of concurrent Gemini calls.
      if (!manualKickoff) setTimeout(() => draftFirstEmail(client.id), result.enrolled * DRAFT_STAGGER_MS);
      result.enrolled += 1;
      logger.info('client import: client enrolled', {
        instanceId: instance.id,
        clientId: client.id,
        email: candidate.email,
        ...(waPhone ? { waPhone } : {}),
      });
      recordAudit({
        actorType: 'system',
        action: 'client.auto_enrolled',
        agentInstanceId: instance.id,
        clientId: client.id,
        detail: {
          clientName: name,
          email: candidate.email,
          ...(waPhone ? { waPhone } : {}),
          source: 'client_import_scan',
        },
      });
    } catch (err) {
      // 23505 = unique_violation: enrolled concurrently (webhook, another run) — fine.
      if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
        result.skipped += 1;
        continue;
      }
      logger.error('client import: client insert failed', err, { instanceId: instance.id, email: candidate.email });
    }
  }
  // Tells open workspace tabs (over SSE) to refetch the sidebar's client list.
  if (result.enrolled > 0) publishInstanceClientsUpdated(instance.id);
  // A failed source keeps its "import now" prompt — only a clean sweep clears them.
  if (failedSources.length === 0) await clearPendingImportFlags(instance, filter);
  return result;
}

/**
 * The daily sweep: for every enabled client-import instance (CLIENT_IMPORT_AGENT_TYPES)
 * with configured sources, enroll any new rows. Runs daily just after local
 * midnight plus once on worker boot; existing clients are skipped, so
 * overlapping runs are harmless.
 */
export async function runClientImportScan(): Promise<void> {
  if (await isKillSwitchOn()) {
    logger.warn('platform kill switch on, skipping client import scan');
    return;
  }
  let instanceCount = 0;
  let enrolled = 0;
  for (const agentType of CLIENT_IMPORT_AGENT_TYPES) {
    const instances = await agentInstances.listEnabledByType(agentType);
    instanceCount += instances.length;
    for (const instance of instances) {
      try {
        const result = await scanClientImportInstance(instance);
        enrolled += result.enrolled;
      } catch (err) {
        // One accountant's bad config/outage must not stop the rest.
        logger.error('client import scan failed for instance', err, { instanceId: instance.id });
      }
    }
  }
  logger.info('client import scan finished', { instances: instanceCount, enrolled });
}
