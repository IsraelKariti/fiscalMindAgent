/**
 * The step link: every audited code step has its own address,
 * `<origin>/#/steps/<audit row id>`, independent of client / agent /
 * accountant. Pure (no React, no window) so it is unit-tested from the root
 * test suite; callers pass `window.location.origin`.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The fields of a step the "copy details" text carries (`discarded` is a timeline-only flag). */
export interface StepLinkStep {
  id: string;
  occurredAt: string;
  actorType: string;
  action: string;
  targetType: string | null;
  targetId: string | null;
  severity: string;
  suspectedInjection: boolean;
  detail: Record<string, unknown>;
}

export function stepLinkOf(stepId: string, origin: string): string {
  return `${origin}/#/steps/${encodeURIComponent(stepId)}`;
}

/** True when the hash is in the step-link namespace, whatever follows it. */
export function isStepHash(hash: string): boolean {
  return /^#\/steps(\/|$)/.test(hash);
}

/** The step id of a `#/steps/<uuid>` hash (trailing slash tolerated), or null for any other or malformed hash. */
export function parseStepHash(hash: string): string | null {
  const match = /^#\/steps\/([^/]+)\/?$/.exec(hash);
  if (!match) return null;
  let id: string;
  try {
    id = decodeURIComponent(match[1]!);
  } catch {
    // A stray "%" makes decodeURIComponent throw.
    return null;
  }
  return UUID.test(id) ? id : null;
}

/**
 * What "copy details" puts on the clipboard: the link on the first line, then
 * the step's complete recorded data as JSON. Self-contained on purpose — the
 * reader (Claude, given a step from production) may have no access to the
 * site or its database.
 */
export function stepDetailsText(step: StepLinkStep, origin: string): string {
  const data = {
    id: step.id,
    occurredAt: step.occurredAt,
    action: step.action,
    actorType: step.actorType,
    severity: step.severity,
    targetType: step.targetType,
    targetId: step.targetId,
    suspectedInjection: step.suspectedInjection,
    detail: step.detail,
  };
  return `${stepLinkOf(step.id, origin)}\n\n${JSON.stringify(data, null, 2)}`;
}
