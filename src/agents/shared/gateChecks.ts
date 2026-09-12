/**
 * The per-check record every code gate writes into its audit row
 * (`detail.checks`), so the conversation trace can list exactly what the gate
 * tested and which check failed. Pure: no llm/db/audit imports — the rules
 * modules build the list, the call sites only copy it into `recordAudit`.
 *
 * Contract (openspec `code-gates`): only checks that actually ran, in the
 * order they ran; `note` is the failure reason when `passed` is false and
 * null when it passed.
 */
export interface GateCheck {
  /** Stable identifier of the check (the UI maps it to a label). */
  key: string;
  passed: boolean;
  /** Why the check failed; null when it passed. */
  note: string | null;
}

const MAX_NOTE = 500;

/** One check entry; the note is kept only for a failure and capped. */
export function check(key: string, passed: boolean, note?: string | null): GateCheck {
  return { key, passed, note: passed ? null : (note ?? '').slice(0, MAX_NOTE) || null };
}

/** true when every check passed (the result of gates whose verdict is "all checks pass"). */
export function allPassed(checks: readonly GateCheck[]): boolean {
  return checks.every((c) => c.passed);
}
