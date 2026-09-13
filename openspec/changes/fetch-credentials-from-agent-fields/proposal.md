## Why

Capital-declaration clients are never offered the Altshuler Shaham / Harel document fetch, even when their checklist holds pending Altshuler/Harel rows and the platform already has everything the login needs. The fetch providers look for the client's national id only in `client_portal_credentials`, a table that only the retired document-collector import scan ever wrote; the capital-declaration kickoff stores the id from the monday CRM card in `clients.agent_fields.id_number` instead. With no credentials row the provider reports "not available", the whole DOCUMENT FETCH section is dropped from the prompt, and the agent asks the client to upload the pension and study-fund reports by hand.

## What Changes

- Altshuler Shaham and Harel fetch availability SHALL also accept the national id the kickoff stored on the client (`agent_fields.id_number`) when no portal-credentials row exists, using the same precedence verification already uses (credentials first, then the stored CRM id).
- Both the prompt-time availability check and the worker's login use the same id-resolution rule, so an offer the agent makes can always be carried out.
- No change for the Israel Tax Authority provider: its login also needs a user code that only lives in `client_portal_credentials`.
- No new storage, migration, or UI.

## Capabilities

### New Capabilities
- `document-fetch`: which clients a document-fetch provider is available for, and where the provider takes the client's login identity from.

### Modified Capabilities
- (none)

## Impact

- `src/agents/declarationOfCapital/taxFetch/providers.ts` (`buildCredentials` for `altshuler_shaham` and `harel`), a small shared id-resolution helper reused by `verifyDocument.ts`.
- Behavior seen by clients: capital-declaration clients with an id on the CRM card now get the fetch offer for pending Altshuler/Harel documents instead of an upload request.
- Tests: a new unit test for the id-resolution order; `npm test` and `npm run typecheck` stay green.
- `docs/agents.md` section on fetch credentials updated.
