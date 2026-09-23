/**
 * The received file a code step is about: an audit row whose target is a
 * `document_file`. Addressed by the step id alone, so the browser never names
 * a file id — the audit row is the path to the file. Pure (the lookups are
 * passed in) so it is unit-tested without a database.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface StepFileLookups<Step extends { target_type: string | null; target_id: string | null }, File> {
  getStep: (id: string) => Promise<Step | null>;
  getFile: (id: string) => Promise<File | null>;
}

/** The step's file, or null for a malformed id, an unknown step, a step that is not about a file, or a file that is gone. */
export async function resolveStepFile<Step extends { target_type: string | null; target_id: string | null }, File>(
  stepId: string | undefined,
  lookups: StepFileLookups<Step, File>,
): Promise<File | null> {
  if (!stepId || !UUID.test(stepId)) return null;
  const step = await lookups.getStep(stepId);
  if (!step || step.target_type !== 'document_file' || !step.target_id || !UUID.test(step.target_id)) return null;
  return lookups.getFile(step.target_id);
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
