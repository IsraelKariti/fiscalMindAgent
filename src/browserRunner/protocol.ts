/**
 * Version of the worker↔runner HTTP contract. Imported by both sides, so each
 * build bakes in the version of the source it was compiled from: the runner
 * reports it on /healthz and the worker refuses to start a login against a
 * runner that answers with anything else.
 *
 * Bump this on ANY breaking change to the session endpoints' request or
 * response shapes (src/browserRunner/server.ts ↔ taxFetch/fetchClient.ts).
 * History: 1 = flat idNumber/userCode login body (images v1/v2); 2 = nested
 * provider-keyed `credentials` record (2026-07-26, commit a578dad) — the
 * unversioned skew that broke prod fetches on 2026-08-01; 3 = 502 error bodies
 * carry `code` ('no_documents') + `screenshotBase64` failure evidence
 * (2026-08-02) — additive, but versioned so the worker never diagnoses against
 * a runner that can't produce the evidence.
 */
export const RUNNER_PROTOCOL_VERSION = 3;
