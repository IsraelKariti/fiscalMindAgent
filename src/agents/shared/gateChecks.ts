/**
 * The per-check record every code gate writes into its audit row
 * (`detail.checks`), so the conversation trace can list exactly what the gate
 * tested, what value it looked at, and which check failed. Pure: no
 * llm/db/audit imports — the rules modules build the list, the call sites
 * only copy it into `recordAudit`.
 *
 * Contract (openspec `code-gates`): only checks that actually ran, in the
 * order they ran; `note` is the failure reason when `passed` is false and
 * null when it passed; `observed` is the value the check inspected (also on a
 * pass), `expected` the reference it was compared with when there is one.
 * A national-id number never appears in full — pass it through `maskId`.
 */
export interface GateCheck {
  /** Stable identifier of the check (the UI maps it to a label). */
  key: string;
  passed: boolean;
  /** Why the check failed; null when it passed. */
  note: string | null;
  /** The value the check looked at, as short text; null when there was nothing to show. */
  observed: string | null;
  /** What `observed` was compared with, when the check has a reference; null otherwise. */
  expected: string | null;
}

const MAX_NOTE = 500;
const MAX_VALUE = 300;

const cap = (value: string | null | undefined, max: number): string | null => {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed.slice(0, max);
};

/** One check entry; the note is kept only for a failure, all texts capped. */
export function check(
  key: string,
  passed: boolean,
  note?: string | null,
  values: { observed?: string | null; expected?: string | null } = {},
): GateCheck {
  return {
    key,
    passed,
    note: passed ? null : cap(note, MAX_NOTE),
    observed: cap(values.observed, MAX_VALUE),
    expected: cap(values.expected, MAX_VALUE),
  };
}

/** true when every check passed (the result of gates whose verdict is "all checks pass"). */
export function allPassed(checks: readonly GateCheck[]): boolean {
  return checks.every((c) => c.passed);
}

/**
 * A national id for an audit row: only the last three digits survive
 * (`123456782` → `••••••782`). Non-digits are dropped first.
 */
export function maskId(id: string): string {
  const digits = id.replace(/\D/g, '');
  if (digits.length <= 3) return '•'.repeat(digits.length);
  return '•'.repeat(digits.length - 3) + digits.slice(-3);
}
