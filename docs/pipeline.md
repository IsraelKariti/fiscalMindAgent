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
| Only a never-contacted, paused client starts | `webhook/mondayKickoffRoute.ts` · `isStartable` |
| Unpause, audit `client.kickoff_triggered` | `webhook/mondayKickoffRoute.ts` · `startConversation` |
| Map the form onto the checklist before the first draft (failure → full interview) | `webhook/mondayKickoffRoute.ts` · `preResolveFromForm` → `DOC/formIntake.ts` · `applyFormIntake` |
| Sanitize the answers; an all-empty form is not submitted | `DOC/formIntake.ts` · `sanitizeFormAnswers` |
| The three injection layers over the answers (a failure throws → no intake) | `DOC/formIntake.ts` · `screenFormAnswersForAttackText` → `SH/injectionScreen.ts` · `runInjectionScreen` |
| Attack found: audit and skip the intake | `DOC/formIntake.ts` · `recordFormIntakeSuppressed` |
| Which rows the form may settle | `DOC/formIntake.ts` · `loadResolvableRows` |
| `questionnaire_schema_mapping` LLM call | `DOC/formIntake.ts` · `mapFormToChecklist` (`DOC/formIntakeCall.ts` · `buildFormIntakeCall`) |
| `validate_form_resolutions` gate + step row | `DOC/formIntakeRules.ts` · `validateFormResolutions`; `DOC/formIntake.ts` · `gateFormResolutions` |
| Write the accepted resolutions | `DOC/formIntake.ts` · `applyFormResolutions` |
| First draft | `api/draftFirstEmail.ts` · `draftFirstEmail` → `setFutureEmail` → D |
| The same intake on the first resume from the workspace | `api/workspace.ts` · pause route handler |

## D. The planner (one cycle)

| Step | File · function |
| --- | --- |
| The cycle | `DOC/plan.ts` · `planFollowUp` |
| Load the snapshot: thread, checklist, files, channel, fetch contexts, intake state | `DOC/plan.ts` · `loadPlanningContext` (`loadWaChannelOrThrow`, `lastInboundWhatsAppAt`, `buildIntakeState`, `allDocumentsSettled`) |
| No usable WhatsApp channel → the cycle fails loudly | `DOC/plan.ts` · `loadWaChannelOrThrow` (`getWaChannelState`) |
| Build the prompt (lost files, fetch section, unsent drafts, verification results) | `DOC/plan.ts` · `buildPlannerPrompt` (`taxFetchPromptInputs`, `loadUnsentDrafts`, `verificationResultsForPrompt`) → `DOC/prompt.ts` · `buildPrompt` |
| The facts an approved property paper proved (the "הוכח במסמך שאושר" line of the list and of VERIFICATION RESULTS) | `DOC/provenFacts.ts` · `provenFactsOf`, `provenFactsLine` |
| What the gate may accept this cycle | `DOC/plan.ts` · `buildDecisionContext` |
| `generate_message` LLM call, at most one corrective retry; bill usage | `DOC/plan.ts` · `askPlanner` → `DOC/decide.ts` · `decide`, `buildDecisionCall` |
| `validate_message` gate: shape, then business rules | `DOC/decisionSchema.ts` · `gateDecision` → `normalizeDecision` (`validateResolutions`, `validateAddedInstances`, `validateRetirements`, `validateAttestation`, `validateMatchedFiles`, `validateTaxFetch`, `normalizeFollowUpMessage`, `answerTiesFiles`, `correctionSuffix`) |
| An approved property paper cited instead of a client quote (`proven_by_file_id`): only the appendix change its seller kind implies | `DOC/decisionSchema.ts` · `validateProvenByFile` (pool: `DOC/provenFacts.ts` · `approvedPropertyFilesOf`) |
| `apply_resolutions` | `DOC/plan.ts` · `applyResolutions` |
| `apply_additions` | `DOC/plan.ts` · `applyAdditions` |
| `apply_retirements` | `DOC/plan.ts` · `applyRetirements` |
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
| `send_reply`: roll the send time off weekends and chagim, schedule the draft | `DOC/plan.ts` · `scheduleReply` (`SH/sendAtGuard.ts` · `rollBlockedSendAt`; `orchestration/scheduleDraftEmail.ts` · `scheduleDraftMessage`) |
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
| 2. The code finds the type of that document | `DOC/verifyDocument.ts` · `documentTypeRules` (`DOC/extractionCall.ts` · `checksFor`, `fieldsFor`) |
| 3. Can the code check this file? | `DOC/verifyDocument.ts` · `loadCheckableFile` (`SH/fileEvidence.ts` · `isQuarantined`; `DOC/analyzeFile.ts` · `isAnalyzable`) |
| 4. The code builds the prompt for that type | `DOC/extractionCall.ts` · `buildExtractionCall` (`DOC/verifyChecks.ts` · `EXTRACTION_PROMPT`, `typeFieldsPromptBlock`, `extractionJsonSchemaFor`) |
| 5. `extract_document`: the model reads the data from the file | `DOC/verifyDocument.ts` · `extractDocumentData` |
| 6. Did the model find attack text? | `DOC/verifyDocument.ts` · `stallOnAttackText` |
| 7. `verify_extraction`: the code gate compares the data with known facts | `DOC/verifyDocument.ts` · `checkExtractedData` → `DOC/verifyChecks.ts` · `runChecks` (pure); id on file `clientIdOnFile`; step row `recordVerifyExtractionStep` |
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
