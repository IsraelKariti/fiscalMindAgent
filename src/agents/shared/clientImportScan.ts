import * as agentInstances from '../../db/queries/agentInstances.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as clientPortalCredentials from '../../db/queries/clientPortalCredentials.js';
import * as clients from '../../db/queries/clients.js';
import { draftFirstEmail } from '../../api/draftFirstEmail.js';
import { publishInstanceClientsUpdated } from '../../events/clientEvents.js';
import { resolveSenderMailbox } from '../instanceEmail.js';
import { normalizeE164 } from '../../util/phone.js';
import { logger } from '../../util/logger.js';
import type { AgentInstanceRow } from '../../db/types.js';
import { parseSettings as parseDocCollectorSettings } from '../docCollector/settings.js';
import {
  collectCandidates,
  hasDocumentsColumn,
  loadAllRows,
  parseClientSources,
  parseDocumentsCell,
  type Candidate,
  type ClientSources,
  type PortalCredentials,
} from './clientSources.js';

/** Agent types whose clients are auto-enrolled from the configured sources (every row, no screening). */
export const CLIENT_IMPORT_AGENT_TYPES = ['doc_collector', 'annual_report_assistant'] as const;

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
  notReady: 'no_sources' | 'no_mailbox' | 'no_documents' | null;
}

interface InstanceImportConfig {
  sources: ClientSources;
  /** Doc collector only: a mapped documents column supplies each client's checklist. */
  perRowDocuments: boolean;
  /** Config gap that must block enrollment (beyond having no sources). */
  notReady: 'no_documents' | null;
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
 * panel's per-source "import now" prompt visible. Once a scan has read every
 * source, the prompts have served their purpose — strip the flags from the
 * stored settings (raw JSONB edit so agent-specific keys survive untouched).
 */
async function clearPendingImportFlags(instance: AgentInstanceRow): Promise<void> {
  let changed = false;
  const strip = (list: unknown): unknown =>
    Array.isArray(list)
      ? list.map((entry) => {
          if (entry !== null && typeof entry === 'object' && 'pendingImport' in entry) {
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

function importConfig(instance: AgentInstanceRow): InstanceImportConfig {
  if (instance.agent_type === 'doc_collector') {
    const settings = parseDocCollectorSettings(instance.settings);
    const perRowDocuments = hasDocumentsColumn(settings);
    return {
      sources: settings,
      perRowDocuments,
      // A doc-collector client without documents completes trivially and never
      // gets emailed — refuse to mass-create useless clients. The mapped
      // documents column is the only supply of a client's checklist.
      notReady: perRowDocuments ? null : 'no_documents',
    };
  }
  return { sources: parseClientSources(instance.settings), perRowDocuments: false, notReady: null };
}

/**
 * The checklist an enrolled client starts with: the row's documents cell
 * (doc collector only — other client-import agents track no documents).
 */
function resolveDocuments(config: InstanceImportConfig, candidate: Candidate): { name: string }[] {
  if (!config.perRowDocuments) return [];
  return parseDocumentsCell(candidate.documentsCell).map((name) => ({ name }));
}

/**
 * Enrolls every not-yet-known row of the instance's configured boards/sheets
 * as a client (name+email; doc collector adds its checklist) and kicks the
 * staggered first drafts. Existing clients are skipped, so re-runs and the
 * daily sweep are idempotent. Also serves the settings panel's "import now".
 */
export async function scanClientImportInstance(instance: AgentInstanceRow): Promise<SourceScanResult> {
  const config = importConfig(instance);
  const result: SourceScanResult = { enrolled: 0, skipped: 0, failedSources: [], notReady: null };

  if (config.sources.boards.length === 0 && config.sources.sheets.length === 0) {
    result.notReady = 'no_sources';
    return result;
  }
  if (config.notReady) {
    result.notReady = config.notReady;
    return result;
  }
  if (!(await resolveSenderMailbox(instance.id, instance.user_id))) {
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

  const candidates = collectCandidates(sources);
  const fresh = [];
  for (const candidate of candidates.values()) {
    const existing = await clients.getByEmailAddressForInstance(instance.id, candidate.email);
    if (existing) {
      result.skipped += 1;
      // Credentials/phone keep syncing for already-enrolled clients — this is
      // how a later-filled source column reaches them without re-import.
      await syncCredentials(existing.id, candidate.credentials);
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

  for (const candidate of fresh) {
    const name = candidate.name || candidate.email.split('@')[0] || candidate.email;
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
        emailAddress: candidate.email,
        phone: candidate.phone || null,
      });
      for (const doc of documents) {
        await clientDocuments.insert({ clientId: client.id, name: doc.name, description: null });
      }
      await syncCredentials(client.id, candidate.credentials);
      // Same fire-and-forget first-draft path as manual client creation,
      // staggered so a big import doesn't fire hundreds of concurrent Gemini calls.
      setTimeout(() => draftFirstEmail(client.id), result.enrolled * DRAFT_STAGGER_MS);
      result.enrolled += 1;
      logger.info('client import: client enrolled', { instanceId: instance.id, clientId: client.id, email: candidate.email });
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
  if (failedSources.length === 0) await clearPendingImportFlags(instance);
  return result;
}

/**
 * The daily sweep: for every enabled doc-collector / annual-report instance
 * with configured sources, enroll any new rows. Runs daily just after local
 * midnight plus once on worker boot; existing clients are skipped, so
 * overlapping runs are harmless.
 */
export async function runClientImportScan(): Promise<void> {
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
