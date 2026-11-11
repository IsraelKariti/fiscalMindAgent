/**
 * The icon of a code-step row in the admin trace (openspec `conversation-trace`):
 * a tool-call step (one per accepted call of the planner's answer, named after
 * the tool) shows a tool; the legacy apply_* / send_reply / withhold_reply rows
 * and the code-only actions (send_closing, send_decline_ack, …) a gear; every
 * check and security event a shield. A critical row and an accountant email
 * keep their own marks. Shared by the workspace timeline and the admin viewer.
 */

/** The planner's tools, each also the name of its execution step. */
export const PLANNER_TOOL_STEPS: ReadonlySet<string> = new Set([
  'resolve_document',
  'add_instance',
  'retire_document',
  'state_cost',
  'state_vehicle',
  'attestation',
  'tie_file',
  'mark_collected',
  'send_whatsapp_text',
  'send_whatsapp_template',
  'tax_fetch',
  'conclude',
]);

/** Code-only steps that change state (not a check, not a tool call). */
const CODE_ACTION_STEPS: ReadonlySet<string> = new Set(['send_reply', 'withhold_reply', 'send_closing', 'send_decline_ack', 'planner.rerun_after_verification', 'goal.completed']);

export function isPlannerToolStep(action: string): boolean {
  return PLANNER_TOOL_STEPS.has(action);
}

export function stepGlyph(step: { action: string; severity: string }, accountantEmail = false): string {
  if (step.severity === 'critical') return '⛔';
  if (accountantEmail) return '✉️';
  if (isPlannerToolStep(step.action)) return '🛠️';
  if (step.action.startsWith('apply_') || CODE_ACTION_STEPS.has(step.action)) return '⚙️';
  return '🛡️';
}
