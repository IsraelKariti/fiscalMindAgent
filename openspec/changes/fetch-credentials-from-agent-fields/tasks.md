## 1. Shared id resolution

- [x] 1.1 Add `clientIdNumber(client, preferredProvider)` in `src/agents/declarationOfCapital/taxFetch/clientId.ts` returning `{ id, source }` in the order: preferred provider's credentials row → tax-authority credentials row → trimmed `agent_fields.id_number` → null. Verify with a new `tests/fetchClientId.test.ts` (mocked credentials lookup) covering all four outcomes, added to the `npm test` list.
- [x] 1.2 Make the Altshuler Shaham and Harel `buildCredentials` in `providers.ts` use the helper plus `client.wa_phone`; the tax-authority provider stays as is. Verify `npm run typecheck` passes and the unit test for the stored-id case returns credentials.
- [x] 1.3 Make `verifyDocument.ts` `clientIdOnFile` call the helper for its first two steps (credentials → stored id), keeping the lazy CRM fetch and the `source` labels. Verify `tests/verifyChecks.test.ts` still passes.

## 2. End-to-end check

- [ ] 2.1 For the local client with pending Altshuler rows, an id in `agent_fields.id_number`, and no credentials row, confirm the next agent turn's prompt (via `#/llm-stages` or the conversation trace) contains the DOCUMENT FETCH block for Altshuler, and that the agent offers the fetch rather than asking for an upload.
- [x] 2.2 Confirm a client with no id in either store still gets no fetch block (prompt unchanged) and that the tax-authority provider is still unavailable without a credentials row.

## 3. Docs and wrap-up

- [x] 3.1 Update `docs/agents.md` (fetch credentials section) to state the Altshuler/Harel id order: credentials row → `agent_fields.id_number`. Verify the section reads correctly.
- [ ] 3.2 Run `npm test` and `npm run typecheck`, then commit and push per the repo Git workflow.
