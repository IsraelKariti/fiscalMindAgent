# The conversation pipeline, step by step

Every step and every decision of the declaration-of-capital conversation is one
named function. This file is the map: the step in plain words, then the file
and the function. The order inside each part is the order the code runs.
Trace names (`validate_message`, `verify_extraction`, ...) are the names the
audit rows and the admin's trace view use.

Paths are relative to `src/`. `DOC` = `agents/declarationOfCapital/`,
`SH` = `agents/shared/`.

## A. An inbound WhatsApp message

| Step | File · function |
| --- | --- |
| Twilio webhook arrives; the turn is counted as in flight | `webhook/twilioRoute.ts` · route handler → `webhook/onInboundWhatsApp.ts` · `onInboundWhatsApp` (`orchestration/inboundTurn.ts` · `withInboundInFlight`) |
| Kill switch, sender number → agent instance → client | `webhook/onInboundWhatsApp.ts` · `onInboundWhatsApp` |
| Telemetry regex over the body (log only, no block) | `webhook/onInboundWhatsApp.ts` · `logInjectionTripwires` |
| Store the message once per Twilio MessageSid | `webhook/onInboundWhatsApp.ts` · `storeInboundMessage` |
| Opt-out keyword disables WhatsApp | `webhook/onInboundWhatsApp.ts` · `isOptOut`, `disableWhatsAppOnOptOut` |
| Cancel the outdated pending send, show "drafting" | `webhook/onInboundWhatsApp.ts` · `cancelPendingSendAndShowDrafting` |
| Store the media items (see B) | `webhook/onInboundWhatsApp.ts` · `ingestMessageMedia` |
| OTP reply for a website login? Handled by the fetch worker, no replan | `DOC/taxFetch/inboundOtp.ts` · `maybeHandleOtpInbound` (called from `DOC/index.ts` · `onInboundMessage`) |
| Which messages are screened | `DOC/screenInbound.ts` · `inboundMessageToScreen` |
| `injection_detection_regex` → `injection_detection_llm` → `validate_injection_scan`, fail closed | `SH/injectionScreen.ts` · `runInjectionScreen` (`runInjectionRegexStep`, `screenForInjection`, `recordScanGate`; gate rules `SH/injectionScanRules.ts` · `validateInjectionScan`) |
| Attack found: withhold the message, audit `injection.cycle_suppressed` | `DOC/screenInbound.ts` · `withholdMessage` |
| Attack found: fixed reply, no model | `DOC/screenInbound.ts` · `sendBlockedReply` |
| Ask for one planner run per turn (debounced) | `orchestration/requestReplan.ts` · `requestReplan` → `orchestration/inboundTurnCore.ts` · `createReplanRequester` |
| Plan now, wait, or force? | `orchestration/inboundTurnRules.ts` · `decideReplan`, `isTurnSettled` |
| The replan job: wait/force, kill switch, plan, re-run if the client wrote meanwhile | `queue/replanWorker.ts` · `onReplan` → `orchestration/setFutureEmail.ts` · `setFutureEmail` → D |

## B. An inbound file

| Step | File · function |
| --- | --- |
| Download from WhatsApp, name the file | `webhook/ingestWaMedia.ts` · `ingestWaMedia`, `downloadTwilioMedia`, `waMediaFilename` |
| Store with retry; a lost file is audited (`file.ingest_failed`) | `webhook/ingestInboundFileCore.ts` · `ingestInboundFileWith` |
| Start the analysis | `webhook/analyzeStoredFile.ts` · `analyzeStoredFile` → `DOC/analyzeInboundFile.ts` · `analyzeInboundFile` |
| Unsupported type or size → marked unsupported | `DOC/analyzeInboundFile.ts` · `skipUnsupportedFile` (`DOC/analyzeFile.ts` · `isAnalyzable`) |
| What the model reads: a PDF/image as is, a spreadsheet rendered to text by code; an unreadable spreadsheet → marked failed | `DOC/analyzeInboundFile.ts` · `renderForModel` → `SH/modelFile.ts` · `toModelFile` (`SH/spreadsheetText.ts` · `renderSpreadsheetText`) |
| Keep the "drafting" stamp fresh before each slow step | `DOC/analyzeInboundFile.ts` · `keepDrafting` |
| The three injection layers over the file (filename + text layer, then the bytes) | `DOC/analyzeInboundFile.ts` · `screenFileForAttackText` → `SH/injectionScreen.ts` · `runInjectionScreen` (`screenFileForInjection`) |
| Attack found: quarantine the file | `DOC/analyzeInboundFile.ts` · `quarantineFile` |
| Split a multi-document PDF, or keep the whole file on any trouble | `DOC/analyzeInboundFile.ts` · `splitOrKeepWhole` → `splitIntoChildren` |
| `file_splitting` LLM call | `DOC/splitFile.ts` · `splitFile`, `buildFileSplitCall` |
| `validate_file_split` gate + step row | `DOC/splitFileRules.ts` · `validateFileSplit`; `DOC/analyzeInboundFile.ts` · `recordFileSplitGate` |
| Cut the PDF and store the children (clean up on failure) | `DOC/analyzeInboundFile.ts` · `cutIntoChildren`, `storeChild` |
| Classify each child / the whole file | `DOC/analyzeInboundFile.ts` · `classifyChildren`, `classifyAndStore` |
| Which checklist items may match (only agreed items) | `DOC/analyzeFileRules.ts` · `classifierCandidates` |
| `file_classification` LLM call | `DOC/analyzeFile.ts` · `analyzeFile`, `buildAnalysisCall` |
| `validate_classification` gate + step row | `DOC/analyzeFileRules.ts` · `validateClassification` (`classificationQuarantined`); `DOC/analyzeInboundFile.ts` · `recordClassificationGate` |
| Store the verdict; name a split child | `DOC/analyzeInboundFile.ts` · `classifyAndStore`, `labelChild` (`DOC/splitChildNames.ts` · `childLabel`) |

## C. The questionnaire (form intake) and the kickoff

| Step | File · function |
| --- | --- |
| Kickoff webhook from monday | `webhook/mondayKickoffRoute.ts` · route handler → `startClientForItem` |
| The board must be a configured client source | `webhook/mondayKickoffRoute.ts` · `kickoffBoard` |
| Which client the row is about (CRM link flow, or email/phone cell; enroll on the spot) | `webhook/mondayKickoffRoute.ts` · `resolveKickoffClient` → `DOC/kickoff.ts` · `resolveDeclarationClient` |
| Remember the board row on the client | `webhook/mondayKickoffRoute.ts` · `rememberBoardRow` |
| Only a never-contacted, paused client with no held draft starts | `webhook/mondayKickoffRoute.ts` · `isStartable` |
| Audit `client.kickoff_triggered`; the client stays paused | `webhook/mondayKickoffRoute.ts` · `recordKickoff` |
| Map the form onto the checklist before the first draft (failure → full interview) | `webhook/mondayKickoffRoute.ts` · `preResolveFromForm` → `DOC/formIntake.ts` · `applyFormIntake` |
| Sanitize the answers; an all-empty form is not submitted | `DOC/formIntake.ts` · `sanitizeFormAnswers` |
| The three injection layers over the answers (a failure throws → no intake) | `DOC/formIntake.ts` · `screenFormAnswersForAttackText` → `SH/injectionScreen.ts` · `runInjectionScreen` |
| Attack found: audit and skip the intake | `DOC/formIntake.ts` · `recordFormIntakeSuppressed` |
| Which rows the form may settle | `DOC/formIntake.ts` · `loadResolvableRows` |
| `questionnaire_schema_mapping` LLM call | `DOC/formIntake.ts` · `mapFormToChecklist` (`DOC/formIntakeCall.ts` · `buildFormIntakeCall`) |
| `validate_form_resolutions` gate + step row | `DOC/formIntakeRules.ts` · `validateFormResolutions`; `DOC/formIntake.ts` · `gateFormResolutions` |
| Write the accepted resolutions | `DOC/formIntake.ts` · `applyFormResolutions` |
| First draft, held: paused + never contacted + manual kickoff → planner runs in hold mode | `api/draftFirstEmail.ts` · `draftFirstEmail` → `orchestration/setFutureEmail.ts` · `setFutureEmail` (`orchestration/heldFirstMessage.ts` · `isHeldFirstMessageClient`, `holdsFirstMessage`) → D |
| Store the held draft with its planned time, queue nothing | `orchestration/scheduleDraftEmail.ts` · `scheduleDraftMessage` (`hold`) |
| The same intake on the first resume from the workspace | `api/workspace.ts` · pause route handler |
| Resume: restore the preserved draft at its time / send it now when its time passed / keep a draft held for admin review / redraft | `orchestration/resumeFutureEmail.ts` · `resumeFutureEmail` → `orchestration/resumeDecision.ts` · `resumeAction`; send now = `orchestration/sendFutureEmailNow.ts` · `enqueuePreservedSendNow` |
| Send now: refuse a draft that awaits admin review (409, nothing moves) / promote the queued job | `orchestration/sendFutureEmailNow.ts` · `sendFutureEmailNow` (`orchestration/reviewWait.ts` · `awaitsAdminReview`) |
| The scheduled message's review state for every viewer (`nextScheduled.reviewPending`, `heldAt`) | `api/workspace.ts` · client read handler → `orchestration/reviewWait.ts` · `reviewWaitState` |
| Past-due warning before the resume (workspace, click time) | `web/src/components/Timeline.tsx` · `requestResume` |
| Retry of a failed held first draft | `api/workspace.ts` · redraft route handler |

## D. The planner (one cycle)

| Step | File · function |
| --- | --- |
| The cycle | `DOC/plan.ts` · `planFollowUp` |
| Load the snapshot: thread, checklist, files, channel, fetch contexts, intake state | `DOC/plan.ts` · `loadPlanningContext` (`loadWaChannelOrThrow`, `lastInboundWhatsAppAt`, `buildIntakeState`, `allDocumentsSettled`) |
| No usable WhatsApp channel → the cycle fails loudly | `DOC/plan.ts` · `loadWaChannelOrThrow` (`getWaChannelState`) |
| Build the prompt (lost files, fetch section, unsent drafts, verification results) | `DOC/plan.ts` · `buildPlannerPrompt` (`taxFetchPromptInputs`, `loadUnsentDrafts`, `verificationResultsForPrompt`) → `DOC/prompt.ts` · `buildPrompt` |
| The facts an approved property paper proved (the "הוכח במסמך שאושר" line of the list and of VERIFICATION RESULTS) | `DOC/provenFacts.ts` · `provenFactsOf`, `provenFactsLine` |
| What the gate may accept this cycle | `DOC/plan.ts` · `buildDecisionContext` |
| `generate_message` LLM call — the tools offered for this context, the model answers with one or more tool calls ending in `conclude` (one turn on Gemini/Anthropic; on OpenAI each call is answered `recorded` and the model asked again until `conclude`, 6 turns at most — `gemini/toolTransport.ts` · `runOpenAiToolTurns`); at most one corrective retry; bill usage | `DOC/plan.ts` · `askPlanner` → `DOC/decide.ts` · `decide`, `buildDecisionCall` (`DOC/decisionTools.ts` · `toolsForContext`, `toolJsonSchemas`; transport: `gemini/toolTransport.ts`) |
| `validate_message` gate: `tool_calls` (offered tools, per-tool schema, one `conclude`), then the calls assembled into the decision form, then business rules | `DOC/decisionTools.ts` · `gateDecision` → `parseToolCalls` → `assembleDecision` → `DOC/decisionSchema.ts` · `normalizeDecision` (`validateResolutions`, `validateAddedInstances`, `validateRetirements`, `validateAttestation`, `validateMatchedFiles`, `validateTaxFetch`, `normalizeFollowUpMessage`, `answerTiesFiles`); retry text `DOC/decisionTools.ts` · `correctionSuffix` |
| An approved property paper cited instead of a client quote (`proven_by_file_id`): only the appendix change its seller kind implies | `DOC/decisionSchema.ts` · `validateProvenByFile` (pool: `DOC/provenFacts.ts` · `approvedPropertyFilesOf`) |
| A cost the client stated in the chat (`stated_costs` / an instance's `stated_cost`): the item is a pending cost declaration, the quote is verbatim, the amount is written in the quote (checks `stated_cost_item_allows`, `stated_cost_amount_in_quote`) | `DOC/decisionSchema.ts` · `validateStatedCosts` (`statedCostTargetFault`, `amountAppearsIn`) |
| `apply_resolutions` | `DOC/plan.ts` · `applyResolutions` |
| `apply_additions` | `DOC/plan.ts` · `applyAdditions` |
| `apply_retirements` | `DOC/plan.ts` · `applyRetirements` |
| `apply_stated_costs` — a cost declaration closed by the client's chat message: the row becomes `stated` with the statement as its evidence | `DOC/plan.ts` · `applyStatedCosts` (`clientDocuments.markStated`) |
| A changed checklist voids the attestation; reload; tell the accountant about rows born claimed | `DOC/plan.ts` · `settleChecklistChanges` |
| `apply_attestation` (confirmed) | `DOC/plan.ts` · `applyAttestationConfirmed` |
| Which proposed file ties are allowed (split parents, company agreement) | `SH/fileEvidence.ts` · `applicableFilePairs`; `DOC/fileTies.ts` · `filterPairsByCompany` (`companyRefusal`, `paperRefusal`) |
| Split an item per company / employer | `DOC/plan.ts` · `splitItemsByCompany` → `DOC/companySplit.ts` · `planCompanySplit` (pure) |
| Files the model named for rows it just created | `DOC/fileTies.ts` · `assignFilesToNewRows` |
| Collect, claim, or leave pending? | `DOC/plan.ts` · `decideCollectOrClaim` |
| Mark collected / claimed | `DOC/plan.ts` · `markCollected`, `markClaimed` |
| Link each file under its document | `DOC/plan.ts` · `linkFilesToDocuments` |
| `apply_collections` step row | `DOC/plan.ts` · `recordApplyCollectionsStep` (all of the above: `collectFiles`) |
| Which file each collected document is checked against | `DOC/plan.ts` · `pickVerificationTargets` |
| `withhold_reply` → verify the batch → `planner.rerun_after_verification` → one follow-up cycle | `DOC/plan.ts` · `verifyThenReplan` → E, then `planFollowUp` again with `afterVerification` |
| `goal.completed` when every row is settled and the attestation is confirmed; a premature goal_complete throws | `DOC/plan.ts` · `completeGoalIfDone` |
| `send_closing`: the fixed closing message after completion (open 24h window only, never a template; both completion paths) | `DOC/plan.ts` · `sendClosingMessage` (`DOC/closingMessage.ts` · `closingMessageDelivery`) |
| Closing message text (thanks by first name, the accountant will be in touch if needed) | `DOC/closingMessage.ts` · `closingMessageText` |
| `send_reply`: roll the send time off weekends and chagim, resolve `asap` to now + 1 s, schedule the draft | `DOC/plan.ts` · `scheduleReply` (`SH/sendAtGuard.ts` · `rollBlockedSendAt`, `resolveSendAt`; `orchestration/scheduleDraftEmail.ts` · `scheduleDraftMessage`) |
| `apply_attestation` (request) on this draft | `DOC/plan.ts` · `applyAttestationRequest` |
| The document-fetch action (agreed / start login / cancel) | `DOC/plan.ts` · `taxFetchDecisionOf` → `DOC/taxFetch/flow.ts` · `applyTaxFetchAction` |
| The scheduled send actually goes out | `queue/sendEmailWorker.ts` · `onScheduledSend` → `sendWhatsAppDraft` |

## E. The document check (one document)

Chart: Notion "File handling", "Steps 5 to 7 in detail". Step 1
(the planner ties the file) is D; step 12 (the planner tells the client) is F.

| Chart step | File · function |
| --- | --- |
| The check | `DOC/verifyDocument.ts` · `verifyCollectedDocument` |
| Guards: kill switch, no longer collected, already stalled | `DOC/verifyDocument.ts` · `loadCollectedDocument` |
| 2. The code finds the type of that document | `DOC/verifyDocument.ts` · `documentTypeRules` → `DOC/documentTypes/index.ts` · `documentTypeSpec` (one module per type, `DOC/documentTypes/<type>.ts`; `generic.ts` for ad-hoc rows) |
| 3. Can the code check this file? | `DOC/verifyDocument.ts` · `loadCheckableFile` (`SH/fileEvidence.ts` · `isQuarantined`; `DOC/analyzeFile.ts` · `isAnalyzable`) |
| 4. The code fills the type's prompt with the row's values | `DOC/extractionCall.ts` · `buildExtractionCall` → `fillExtractionPrompt`, `paperContext` (the prompt and the schema are the module's `prompt` / `jsonSchema`) |
| 5. `extract_document`: the model reads the data from the file | `DOC/verifyDocument.ts` · `extractDocumentData` |
| 6. Did the model find attack text? | `DOC/verifyDocument.ts` · `stallOnAttackText` |
| 7. `verify_extraction`: the code gate compares the data with known facts | `DOC/verifyDocument.ts` · `checkExtractedData` → the module's `verify` (pure; one helper per check in `DOC/verifyChecks.ts`: `legibleCheck`, `expectedTypeCheck`, `identityChecks`, `asOfDateCheck`, `notExpiredCheck`, `amountsCheck`, `typeFieldsCheck`, `periodCoversValuationDateCheck`, folded by `verdictOf`); id on file `clientIdOnFile`; step row `recordVerifyExtractionStep` |
| Who does the document belong to? (chart B, over the owner parties) | `DOC/spouseIdentity.ts` · `resolveDocumentOwners` → per person `resolveParty` → `chooseSpouseToAdopt` |
| Spouse adopted from an owner's printed id | `DOC/verifyDocument.ts` · `adoptSpouseFromDocument` (`DOC/spouseIdentity.ts` · `mergeSpouse`) |
| 8. All checks passed? 9. Third failure in a row? | `DOC/verifyDocument.ts` · `applyVerdict` |
| 10. The document is approved | `DOC/verifyDocument.ts` · `approveDocument` |
| 11. The document opens again | `DOC/verifyDocument.ts` · `reopenDocument` |
| 13. The accountant gets an email and takes over | `DOC/verifyDocument.ts` · `stallAfterRepeatedFailures`, `stall` |
| A batch of documents, one after the other | `DOC/verifyDocument.ts` · `verifyBatch` → `DOC/verifyBatchRules.ts` · `runVerificationBatch` |

## F. The reply after a check

| Step | File · function |
| --- | --- |
| Inside a planner cycle: verify, record the rerun, plan again | `DOC/plan.ts` · `verifyThenReplan`; `DOC/verifyDocument.ts` · `recordRerunAfterVerification` |
| After a website fetch delivered documents: verify, then one cycle | `DOC/taxFetch/deliver.ts` · `deliver` → `DOC/verifyDocument.ts` · `verifyBatchAndReplan` |
| The follow-up cycle may not collect again | `DOC/decisionSchema.ts` · `normalizeDecision` (afterVerification); `DOC/plan.ts` · `decideCollectOrClaim`, `splitItemsByCompany` (skipped) |
| 12. The planner tells the client the result | `DOC/plan.ts` · `scheduleReply` (with `verificationResultsForPrompt` in the prompt) |

## G. Around every LLM call (all stages)

Every `runLlmCall` goes through one retry loop. When the model's provider is
Anthropic or OpenAI, the provider adapter changes the request before sending
and (Anthropic) the answer on the way back; both are code steps of the
client's trace and the call row keeps the request as sent
(`llm_calls.request.sent`). Gemini sends the request as declared: no steps,
no sent copy.

| Step | File · function |
| --- | --- |
| The code computes what the adapter will send (schema / tools as the provider receives them, `temperature` left out) | `gemini/wireRequest.ts` · `translationOf` (`gemini/anthropicSchema.ts` · `toAnthropicSchema`; `gemini/toolTransport.ts` · `toAnthropicTools`, `toOpenAiTools`) |
| `translate_request`: the trace step listing what changed (null options removed, fields dropped from `required`, keywords stripped, request fields left out, tools strict) | `gemini/generate.ts` · `generateWithRetryDetailed` → `gemini/wireRequest.ts` · `translateStepOf`, `translationStepDetail` |
| The adapter sends exactly that copy | `gemini/anthropic.ts` · `generateContentAnthropic`; `gemini/openai.ts` · `generateContentOpenAI` (both read `sentRequestOf`) |
| The call row stores the declared request plus the sent copy | `gemini/generate.ts` · `recordCall` → `gemini/requestLog.ts` · `requestForLog(request, sent)` |
| Anthropic only: the adapter puts null back into every nullable field the model left out, and marks the paths on the response | `gemini/anthropicSchema.ts` · `restoreOmittedNulls` (`restoredFields`) |
| `restore_answer`: the trace step listing the filled paths (recorded after the call row, so the trace reads translate → call → restore) | `gemini/generate.ts` · `recordCall` → `gemini/wireRequest.ts` · `restoreStepOf` |
| Steps are recorded only for a DB-logged call of a client (never for the evals harness) | `gemini/wireRequest.ts` · `traceStepsEnabled` |

Each stage may have a **backup model** on another provider (openspec
`llm-model-settings`, admin settings → "מודל השפה"). With one set, the
primary gets one attempt and one retry; when it still did not answer, the
same request goes to the backup with the full retry loop.

| Step | File · function |
| --- | --- |
| The code resolves the stage's backup (null when none, unavailable, or on the primary's provider) | `gemini/modelSettings.ts` · `resolveBackupModel` (`gemini/modelCatalog.ts` · `backupConflict`) |
| Primary attempted with a cap of 2 attempts when a backup exists; a pinned model (evals harness) never falls back | `gemini/llmCall.ts` · `runWithBackup` → `gemini/generate.ts` · `generateWithRetryDetailed(request, log, maxAttempts)` |
| Was it the provider that failed? (API error of any status, timeout, network — never the budget stop) | `gemini/generate.ts` · `isProviderFailure`, `failureReasonOf` |
| `fallback_model`: the trace step naming the primary, the backup, their providers and the failure reason (between the primary's error row and the backup's call row) | `gemini/llmCall.ts` · `runWithBackup` → `gemini/wireRequest.ts` · `fallbackStepOf` |
| The same request on the backup, full retry loop, own call row; the result names the backup model | `gemini/llmCall.ts` · `runWithBackup` → `gemini/generate.ts` · `generateWithRetryDetailed` |
| The admin saves / refuses the pair (backup must be from another provider; a colliding primary change is refused too) | `api/admin.ts` · `adminSetPurposeBackupModel`, `adminSetPurposeModel`, `adminSetModel` (`backupConflictingStage`) |
