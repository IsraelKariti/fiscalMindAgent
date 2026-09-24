/**
 * The received file a code step is about: an audit row whose target is a
 * `document_file`, or one whose target is a list item (`client_document`)
 * and whose detail names the one file it checked (`fileId` — the verification
 * steps). Addressed by the step id alone, so the browser never names a file
 * id — the audit row is the path to the file. Pure (the lookups are passed
 * in) so it is unit-tested without a database.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StepFileStep {
  target_type: string | null;
  target_id: string | null;
  client_id: string | null;
  detail: Record<string, unknown>;
}

export interface StepFileLookups<Step extends StepFileStep, File extends { client_id: string }> {
  getStep: (id: string) => Promise<Step | null>;
  getFile: (id: string) => Promise<File | null>;
}

/**
 * The file id a step is about, or null. A `document_file` target names it
 * outright; a `client_document` target names it in `detail.fileId` — the
 * caller must then check the file's client, since detail is a free JSON bag.
 */
export function stepFileIdOf(step: Pick<StepFileStep, 'target_type' | 'target_id' | 'detail'>): string | null {
  if (step.target_type === 'document_file') return step.target_id && UUID.test(step.target_id) ? step.target_id : null;
  if (step.target_type === 'client_document') {
    const fileId = step.detail['fileId'];
    return typeof fileId === 'string' && UUID.test(fileId) ? fileId : null;
  }
  return null;
}

/**
 * The step's file, or null for a malformed id, an unknown step, a step that
 * is not about a file, a file that is gone, or a detail-named file of another
 * client.
 */
export async function resolveStepFile<Step extends StepFileStep, File extends { client_id: string }>(
  stepId: string | undefined,
  lookups: StepFileLookups<Step, File>,
): Promise<File | null> {
  if (!stepId || !UUID.test(stepId)) return null;
  const step = await lookups.getStep(stepId);
  if (!step) return null;
  const fileId = stepFileIdOf(step);
  if (!fileId) return null;
  const file = await lookups.getFile(fileId);
  if (!file) return null;
  if (step.target_type === 'client_document' && file.client_id !== step.client_id) return null;
  return file;
}

export interface CallFileLookups<Call extends { document_file_id: string | null }, File> {
  getCall: (id: string) => Promise<Call | null>;
  getFile: (id: string) => Promise<File | null>;
}

/**
 * The received file an LLM call read (`llm_calls.document_file_id`), addressed
 * by the call id alone — the call-keyed twin of resolveStepFile. Null for a
 * malformed id, an unknown call, a call that read no file, or a file that is gone.
 */
export async function resolveCallFile<Call extends { document_file_id: string | null }, File>(
  callId: string | undefined,
  lookups: CallFileLookups<Call, File>,
): Promise<File | null> {
  if (!callId || !UUID.test(callId)) return null;
  const call = await lookups.getCall(callId);
  if (!call || !call.document_file_id || !UUID.test(call.document_file_id)) return null;
  return lookups.getFile(call.document_file_id);
}
