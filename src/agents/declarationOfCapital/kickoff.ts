import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import { fetchItemDetails, type ItemDetails } from '../customerService/mondayData.js';
import { parseTaxYearCell } from '../shared/taxYear.js';
import { normalizeE164 } from '../../util/phone.js';
import { syntheticWaEmail } from '../../util/syntheticEmail.js';
import { recordAudit } from '../../audit/audit.js';
import { publishInstanceClientsUpdated } from '../../events/clientEvents.js';
import { logger } from '../../util/logger.js';
import { catalogSeedRows } from './catalog.js';
import type { FormAnswer } from './formIntake.js';
import type { BoardSource } from '../shared/clientSources.js';
import type { AgentInstanceRow, ClientRow } from '../../db/types.js';

/**
 * The declaration-of-capital kickoff resolution: the webhook's board row (the
 * declarations board) carries no phone — the client's identity lives on two
 * connect-boards links. This module follows them:
 *
 *   declarations row ── crmLinkColumnId ──▶ CRM item (phone, name, ת"ז)
 *                    └─ formLinkColumnId ─▶ questionnaire item (the answers)
 *
 * and returns (enrolling first if needed) the phone-keyed client plus the form
 * answers the pre-resolution (formIntake.ts) maps onto the checklist. The
 * engagement is keyed by the row's file number + declaration year; the year is
 * per-client (agent_fields.tax_year) and drives the seeded checklist, the
 * prompts and the verification date checks.
 */

/** Title fallbacks when the CRM board has no phone-typed column / for the ID cell. */
const PHONE_TITLE = /phone|mobile|cell|טלפון|נייד/i;
const ID_TITLE = /מספר זהות|תעודת זהות|^ת\.?["”״׳']?ז\.?$/i;

/** monday column types that can never be a form question's answer. */
const NON_ANSWER_TYPES = new Set(['board_relation', 'mirror', 'subtasks', 'file', 'formula', 'button']);

function findPhone(crm: ItemDetails): string | null {
  const typed = crm.columns.find((c) => c.type === 'phone' && c.text !== '');
  const titled = typed ?? crm.columns.find((c) => PHONE_TITLE.test(c.title.trim()) && c.text !== '');
  return titled ? normalizeE164(titled.text) : null;
}

function findIdNumber(crm: ItemDetails): string | null {
  const cell = crm.columns.find((c) => ID_TITLE.test(c.title.trim()) && c.text !== '');
  const digits = cell?.text.replace(/\D/g, '') ?? '';
  return digits.length >= 5 ? digits : null;
}

export interface DeclarationIntake {
  client: ClientRow;
  /** The submitted questionnaire's question/answer pairs ([] when the form link is missing/empty). */
  formAnswers: FormAnswer[];
  taxYear: number;
}

/**
 * Resolves the webhook's declarations-board row to its (possibly just-enrolled)
 * client. Null (with a warn log) whenever a link in the chain is missing — the
 * webhook treats that as "not startable", answers 200 and waits for the board
 * to be fixed.
 */
export async function resolveDeclarationClient(
  instance: AgentInstanceRow,
  board: BoardSource,
  itemId: string,
  accessToken: string,
): Promise<DeclarationIntake | null> {
  const log = { instanceId: instance.id, boardId: board.boardId, itemId };

  const row = await fetchItemDetails(accessToken, itemId);
  if (!row) {
    logger.warn('declaration kickoff: board item not found / not visible', log);
    return null;
  }
  const column = (id: string | undefined) => (id ? row.columns.find((c) => c.id === id) : undefined);

  const crmItemId = column(board.crmLinkColumnId)?.linkedItemIds[0];
  if (!crmItemId) {
    logger.warn('declaration kickoff: row has no linked CRM item', log);
    return null;
  }
  const crm = await fetchItemDetails(accessToken, crmItemId);
  if (!crm) {
    logger.warn('declaration kickoff: linked CRM item not found / not visible', { ...log, crmItemId });
    return null;
  }
  const waPhone = findPhone(crm);
  if (!waPhone) {
    logger.warn('declaration kickoff: linked CRM item has no usable phone', { ...log, crmItemId });
    return null;
  }
  const clientName = crm.itemName.trim() || row.itemName.trim() || waPhone;
  const idNumber = findIdNumber(crm);

  const fileNumber = column(board.fileNumberColumnId)?.text || undefined;
  // The declaration year is the engagement identity (file number + year) and
  // scopes every date-dependent document — a row without a parseable year is
  // not started; there is deliberately no instance-level fallback.
  const taxYear = parseTaxYearCell(column(board.yearColumnId)?.text);
  if (taxYear === null) {
    logger.warn('declaration kickoff: row has no parseable declaration year (map the year column and fill the cell)', log);
    return null;
  }

  // The submitted questionnaire: every answerable column of the linked
  // responses-board item, as question (column title) / answer (cell text).
  const formItemId = column(board.formLinkColumnId)?.linkedItemIds[0];
  let formAnswers: FormAnswer[] = [];
  if (formItemId) {
    const form = await fetchItemDetails(accessToken, formItemId);
    if (!form) {
      logger.warn('declaration kickoff: linked questionnaire item not found / not visible', { ...log, formItemId });
    } else {
      // Empty cells are kept: a question the client left blank means "I don't
      // have this" and pre-resolves its type to not_required (formIntake.ts).
      formAnswers = form.columns
        .filter((c) => !NON_ANSWER_TYPES.has(c.type))
        .map((c) => ({ question: c.title, answer: c.text }));
    }
  } else {
    logger.warn('declaration kickoff: row has no linked questionnaire item', log);
  }

  let client = await clients.getByWaPhoneForInstance(instance.id, waPhone);
  if (!client) {
    try {
      client = await clients.insert({
        userId: instance.user_id,
        agentInstanceId: instance.id,
        name: clientName,
        emailAddress: syntheticWaEmail(waPhone),
        phone: waPhone,
        paused: true,
        agentFields: {
          monday_board_id: board.boardId,
          monday_item_id: itemId,
          monday_crm_item_id: crmItemId,
          ...(formItemId ? { monday_form_item_id: formItemId } : {}),
          tax_year: taxYear,
          ...(fileNumber ? { file_number: fileNumber } : {}),
          ...(idNumber ? { id_number: idNumber } : {}),
        },
      });
      // The catalog checklist, rendered for THIS row's declaration year.
      for (const doc of catalogSeedRows(taxYear)) {
        await clientDocuments.insert({
          clientId: client.id,
          name: doc.name,
          description: doc.description,
          typeKey: doc.typeKey,
          status: 'unresolved',
        });
      }
      publishInstanceClientsUpdated(instance.id);
      recordAudit({
        actorType: 'system',
        action: 'client.auto_enrolled',
        agentInstanceId: instance.id,
        clientId: client.id,
        detail: { clientName, waPhone, taxYear, ...(fileNumber ? { fileNumber } : {}), source: 'monday_kickoff' },
      });
      logger.info('declaration kickoff: client enrolled', { ...log, clientId: client.id, waPhone, taxYear });
    } catch (err) {
      // 23505 = enrolled concurrently (double webhook delivery) — take the winner's row.
      if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') {
        client = await clients.getByWaPhoneForInstance(instance.id, waPhone);
      }
      if (!client) {
        logger.error('declaration kickoff: client enrollment failed', err, log);
        return null;
      }
    }
  } else {
    // Re-fired webhook / pre-existing client: keep the engagement identity fresh.
    await clients
      .setDeclarationEngagement(client.id, {
        taxYear,
        ...(fileNumber ? { fileNumber } : {}),
        ...(idNumber ? { idNumber } : {}),
        crmItemId,
        ...(formItemId ? { formItemId } : {}),
      })
      .catch((err) => logger.error('declaration kickoff: engagement backfill failed', err, { ...log, clientId: client!.id }));
  }

  if (!client.wa_phone) {
    // insert() drops the number on a collision with another client of the
    // instance — a WhatsApp-only client without one can never be messaged.
    logger.warn('declaration kickoff: client has no WhatsApp number (collision?)', { ...log, clientId: client.id });
  }
  return { client, formAnswers, taxYear };
}
