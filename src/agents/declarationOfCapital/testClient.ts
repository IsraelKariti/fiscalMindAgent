import * as clients from '../../db/queries/clients.js';
import { recordAudit } from '../../audit/audit.js';
import { draftFirstEmail } from '../../api/draftFirstEmail.js';
import { normalizeE164 } from '../../util/phone.js';
import { logger } from '../../util/logger.js';
import { sanitizeInline } from '../shared/promptSafety.js';
import { maskId } from '../shared/gateChecks.js';
import { applyFormIntake } from './formIntake.js';
import { enrollDeclarationClient, spouseAuditDetail, storableFormAnswers } from './kickoff.js';
import type { SpouseOnFile } from './spouseIdentity.js';
import type { TestClientInput } from './testClientSchema.js';
import type { AgentInstanceRow, ClientRow } from '../../db/types.js';

/**
 * The admin's hand-filled test client (openspec `admin-test-client`): the
 * same identity the monday kickoff reads from the CRM card and the
 * questionnaire item, typed into a form by an admin viewing the workspace as
 * the accountant. The client is enrolled through the kickoff's own path
 * (paused, catalog seeded, questionnaire pre-resolved, first message drafted
 * and held) with `is_test` set, so every accountant-facing roster hides it.
 * Nothing on monday is read or written.
 */

export { TestClientSchema, type TestClientInput } from './testClientSchema.js';

export type CreateTestClientResult =
  | { ok: true; client: ClientRow }
  | { ok: false; status: 400 | 409; error: string };

/**
 * One named function per step: validatePhone, enrollDeclarationClient
 * (kickoff.ts), preResolveTestForm, draftFirstEmail. The audit entry names the
 * real admin as the actor.
 */
export async function createTestClient(
  instance: AgentInstanceRow,
  adminUserId: string,
  input: TestClientInput,
): Promise<CreateTestClientResult> {
  const waPhone = normalizeE164(input.phone);
  if (!waPhone) return { ok: false, status: 400, error: 'A valid phone number is required.' };
  if (await clients.getByWaPhoneForInstance(instance.id, waPhone)) {
    return { ok: false, status: 409, error: 'A client with this phone number already exists.' };
  }

  const spouse: SpouseOnFile = {
    name: input.spouseName ?? null,
    idNumber: input.spouseIdNumber ?? null,
    nameSource: input.spouseName ? 'questionnaire' : null,
    idSource: input.spouseIdNumber ? 'questionnaire' : null,
  };
  const formAnswers = input.formAnswers ?? [];
  const client = await enrollDeclarationClient(
    instance,
    {
      name: sanitizeInline(input.name, 200),
      waPhone,
      taxYear: input.taxYear,
      idNumber: input.idNumber ?? null,
      fileNumber: input.fileNumber ?? null,
      spouse,
      maritalStatus: input.maritalStatus ?? null,
      formAnswers: storableFormAnswers(formAnswers),
    },
    { isTest: true },
  );
  recordAudit({
    actorType: 'admin',
    actorUserId: adminUserId,
    action: 'client.test_created',
    agentInstanceId: instance.id,
    clientId: client.id,
    detail: {
      clientName: client.name,
      waPhone,
      taxYear: input.taxYear,
      ...(input.fileNumber ? { fileNumber: input.fileNumber } : {}),
      ...(input.idNumber ? { idNumber: maskId(input.idNumber) } : {}),
      ...spouseAuditDetail(spouse),
      ...(input.maritalStatus ? { maritalStatus: input.maritalStatus } : {}),
      formAnswers: formAnswers.length,
      source: 'admin_test_form',
    },
  });
  logger.info('admin test client created', { instanceId: instance.id, clientId: client.id, adminUserId, waPhone });

  await preResolveTestForm(client, formAnswers, input.taxYear);
  // Same fire-and-forget first-draft path as the monday kickoff — the client
  // is paused, so the draft is stored with its planned time and held.
  draftFirstEmail(client.id);
  return { ok: true, client };
}

/** The questionnaire pre-resolution of the kickoff; a failure leaves everything to the interview. */
async function preResolveTestForm(client: ClientRow, formAnswers: TestClientInput['formAnswers'], taxYear: number): Promise<void> {
  if (!formAnswers || formAnswers.length === 0) return;
  try {
    await applyFormIntake(client, formAnswers, taxYear);
  } catch (err) {
    logger.error('admin test client: form intake failed — falling back to the full interview', err, { clientId: client.id });
  }
}
