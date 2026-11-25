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
| Cancel the outdated pending send, stamp "processing" (the inputs are being analyzed; openspec `turn-activity-states`) | `webhook/onInboundWhatsApp.ts` · `cancelPendingSendAndShowProcessing` |
| Stamp the cancelled draft with the time and the reason (`client_message` here; every `removeFutureEmail` caller names its own, openspec `discarded-message-analytics`) | `orchestration/removeFutureEmail.ts` · `removeFutureEmail` → `db/queries/emails.ts` · `markDiscarded`, `supersedePendingReview` |
| Store the media items (see B) | `webhook/onInboundWhatsApp.ts` · `ingestMessageMedia` |
| OTP reply for a website login? Handled by the fetch worker, no replan | `DOC/taxFetch/inboundOtp.ts` · `maybeHandleOtpInbound` (called from `DOC/index.ts` · `onInboundMessage`) |
| Which messages are screened | `DOC/screenInbound.ts` · `inboundMessageToScreen` |
| `injection_detection_regex` → `injection_detection_llm` → `validate_injection_scan`, fail closed | `SH/injectionScreen.ts` · `runInjectionScreen` (`runInjectionRegexStep`, `screenForInjection`, `recordScanGate`; gate rules `SH/injectionScanRules.ts` · `validateInjectionScan`) |
| Attack found: withhold the message, audit `injection.cycle_suppressed` | `DOC/screenInbound.ts` · `withholdMessage` |
| Attack found: fixed reply, no model | `DOC/screenInbound.ts` · `sendBlockedReply` |
| Screen could not run (provider held, openspec `llm-provider-outage`): the message waits for its screen, no reply, client marked held | `DOC/screenInbound.ts` · `screenMessageRow`, `holdMessage` → `orchestration/outageHold.ts` · `holdClientForOutage` |
| Ask for one planner run per turn (debounced) | `orchestration/requestReplan.ts` · `requestReplan` → `orchestration/inboundTurnCore.ts` · `createReplanRequester` |
| Plan now, wait, or force? (a hold → wait, never force) | `orchestration/inboundTurnRules.ts` · `decideReplan`, `isTurnSettled`; `orchestration/outageRecovery.ts` · `plannerHeld` |
| The replan job: wait/force, kill switch, plan, re-run if the client wrote meanwhile | `queue/replanWorker.ts` · `onReplan` → `orchestration/setFutureEmail.ts` · `setFutureEmail` → D |
| Name what started the cycle (`client_message` here; every `setFutureEmail` caller passes a `PlanTrigger`) and mint the cycle id every planner call and the draft record (`llm_calls.plan_run_id`, `emails.plan_run_id`) | `orchestration/setFutureEmail.ts` · `setFutureEmail` (hints `trigger`, `planRunId`) → `DOC/plan.ts` · `askPlanner` (log), `scheduleFollowUp` → `orchestration/scheduleDraftEmail.ts` · `scheduleDraftMessage` |

## B. An inbound file

| Step | File · function |
| --- | --- |
| Download from WhatsApp, name the file | `webhook/ingestWaMedia.ts` · `ingestWaMedia`, `downloadTwilioMedia`, `waMediaFilename` |
| Store with retry; a lost file is audited (`file.ingest_failed`) | `webhook/ingestInboundFileCore.ts` · `ingestInboundFileWith` |
| Start the analysis | `webhook/analyzeStoredFile.ts` · `analyzeStoredFile` → `DOC/analyzeInboundFile.ts` · `analyzeInboundFile` |
| Unsupported type or size → marked unsupported | `DOC/analyzeInboundFile.ts` · `skipUnsupportedFile` (`DOC/analyzeFile.ts` · `isAnalyzable`) |
| What the model reads: a PDF/image as is, a spreadsheet rendered to text by code; an unreadable spreadsheet → marked failed | `DOC/analyzeInboundFile.ts` · `renderForModel` → `SH/modelFile.ts` · `toModelFile` (`SH/spreadsheetText.ts` · `renderSpreadsheetText`) |
| Keep the "processing" stamp fresh before each slow step | `DOC/analyzeInboundFile.ts` · `keepProcessing` |
| The three injection layers over the file (filename + text layer, then the bytes) | `DOC/analyzeInboundFile.ts` · `screenFileForAttackText` → `SH/injectionScreen.ts` · `runInjectionScreen` (`screenFileForInjection`) |
| Attack found: quarantine the file | `DOC/analyzeInboundFile.ts` · `quarantineFile` |
| Provider held at any model step (screen, split, classify): the file stays pending, marked held, client marked held | `DOC/analyzeInboundFile.ts` · `holdFile` → `orchestration/outageHold.ts` · `holdClientForOutage` |
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
| The tax advisor named on the row (first person of the people column → monday user → accountant / staff row / unmatched; empty cell clears) | `DOC/kickoff.ts` · `resolveTaxAdvisor` → `DOC/taxAdvisor.ts` · `matchTaxAdvisor` |
| Remember the board row on the client | `webhook/mondayKickoffRoute.ts` · `rememberBoardRow` |
| Admin re-reads the advisor of every remembered row (view-as only, `POST /clients/tax-advisor-backfill`; refuses without a monday connection; counts updated / cleared / unchanged / skipped / failed) | `DOC/taxAdvisorBackfill.ts` · `backfillTaxAdvisors` |
| The client's remembered monday row (none → skipped) | `DOC/taxAdvisorBackfillRules.ts` · `rememberedRow` |
| The configured board that maps the advisor column (not a source / unmapped → skipped) | `DOC/taxAdvisorBackfillRules.ts` · `boardForRow` |
| Fetch the row and resolve the advisor (row gone / API error → failed) | `DOC/taxAdvisorBackfill.ts` · `rereadAdvisor` → `DOC/kickoff.ts` · `resolveTaxAdvisor` (users lookup memoised per run: `DOC/taxAdvisorBackfillRules.ts` · `memoisedUsersLookup`) |
| Same person and match → unchanged, nothing written | `DOC/taxAdvisorBackfillRules.ts` · `advisorChanged` |
| Store (null clears), audit `client.tax_advisor_backfilled` with the admin as actor | `DOC/taxAdvisorBackfill.ts` · `storeBackfilledAdvisor` |
| Only a never-contacted client with no held/scheduled draft starts (paused or not) | `webhook/mondayKickoffRoute.ts` · `isStartable` → `orchestration/holdRule.ts` · `kickoffStartable` |
| The row must name a tax advisor with an email (column unmapped / cell empty / email unreadable → `agent_fields.kickoff_blocked` + audit `client.kickoff_refused`, nothing drafted, header badge; a passing kickoff clears the stamp) | `webhook/mondayKickoffRoute.ts` · `hasTaxAdvisor` → `DOC/kickoffGate.ts` · `kickoffBlockReason`, `refuseKickoffWith` |
| Audit `client.kickoff_triggered`; the client stays paused only while the instance's first-message approval is on | `webhook/mondayKickoffRoute.ts` · `recordKickoff` |
| Map the form onto the checklist before the first draft (failure → full interview) | `webhook/mondayKickoffRoute.ts` · `preResolveFromForm` → `DOC/formIntake.ts` · `applyFormIntake` |
| Sanitize the answers; an all-empty form is not submitted | `DOC/formIntake.ts` · `sanitizeFormAnswers` |
| The three injection layers over the answers (a failure throws → no intake) | `DOC/formIntake.ts` · `screenFormAnswersForAttackText` → `SH/injectionScreen.ts` · `runInjectionScreen` |
| Attack found: audit and skip the intake | `DOC/formIntake.ts` · `recordFormIntakeSuppressed` |
| Which rows the form may settle | `DOC/formIntake.ts` · `loadResolvableRows` |
| `questionnaire_schema_mapping` LLM call | `DOC/formIntake.ts` · `mapFormToChecklist` (`DOC/formIntakeCall.ts` · `buildFormIntakeCall`) |
| `validate_form_resolutions` gate + step row | `DOC/formIntakeRules.ts` · `validateFormResolutions`; `DOC/formIntake.ts` · `gateFormResolutions` |
| Write the accepted resolutions | `DOC/formIntake.ts` · `applyFormResolutions` |
| Enrollment pauses the client only when manual kickoff + first-message approval on (`agent_instances.first_message_approval`) | `orchestration/holdRule.ts` · `enrollsPaused` (used by `DOC/kickoff.ts` · `enrollDeclarationClient`, `shared/clientImportScan.ts`) |
| First draft, held: paused + never contacted + manual kickoff → planner runs in hold mode (approval off → client running → normal draft + queued send) | `api/draftFirstEmail.ts` · `draftFirstEmail` → `orchestration/setFutureEmail.ts` · `setFutureEmail` (`orchestration/heldFirstMessage.ts` · `isHeldFirstMessageClient`, `holdsFirstMessage`) → D |
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
| Which templates this client may get: intro only before the first delivered message, reopen only after; the rest listed as hidden | `DOC/templatePurpose.ts` · `splitTemplatesByPurpose` (`hiddenTemplateReason`; `emails.hasDeliveredOutbound`) |
| Build the prompt (lost files, fetch section, unsent drafts, verification results); the system prompt is static, the per-request facts open the input | `DOC/plan.ts` · `buildPlannerPrompt` (`taxFetchPromptInputs`, `loadUnsentDrafts`, `verificationResultsForPrompt`, `taxFetch/flow.ts` · `sitesForUnnamedRows`)
| Which pending rows name no company, and the fetch sites a company answer would unlock for each (the row's "חברה: לא ידועה" line, openspec `item-company-clarification`) | `DOC/companyClarification.ts` · `rowCompanyUnknown`, `sitesForUnnamedRow` → `DOC/prompt.ts` · `companyUnknownLine` → `DOC/prompt.ts` · `buildPrompt` (`buildSystemPrompt`, `buildRunContextSection`) |
| The facts an approved property paper proved (the "הוכח במסמך שאושר" line of the list and of VERIFICATION RESULTS) | `DOC/provenFacts.ts` · `provenFactsOf`, `provenFactsLine` |
| What the gate may accept this cycle | `DOC/plan.ts` · `buildDecisionContext` |
| `planner` LLM call — the tools offered for this context, the model answers with one or more tool calls ending in `conclude` (one turn on Gemini/Anthropic; on OpenAI each call is answered `recorded` and the model asked again until `conclude`, 6 turns at most — `gemini/toolTransport.ts` · `runOpenAiToolTurns`); at most one corrective retry; bill usage | `DOC/plan.ts` · `askPlanner` → `DOC/decide.ts` · `decide`, `buildDecisionCall` (`DOC/decisionTools.ts` · `toolsForContext`, `toolJsonSchemas`; transport: `gemini/toolTransport.ts`) |
| `validate_message` gate: `tool_calls` (offered tools, per-tool schema, one `conclude`), then the calls assembled into the decision form, then business rules | `DOC/decisionTools.ts` · `gateDecision` → `parseToolCalls` → `assembleDecision` → `DOC/decisionSchema.ts` · `normalizeDecision` (`validateResolutions`, `validateAddedInstances`, `validateRetirements`, `validateAttestation`, `validateMatchedFiles`, `validateTaxFetch`, `normalizeFollowUpMessage`, `answerTiesFiles`); retry text `DOC/decisionTools.ts` · `correctionSuffix` |
| Which received files prove their own item (a report of a known institution, high confidence, every holder the client or the spouse by first and last name) — the pool `proven_by_file_id` may cite for a needed resolution or an addition of the file's type; their file lines carry the "self-evident" marker | `DOC/selfEvidentFiles.ts` · `selfEvidentFilesOf` (`selfEvidentFileOf`, `selfEvidentMarker`; names via `sharedNameTokens` in `DOC/spouseIdentity.ts`), built in `DOC/plan.ts` · `buildIntakeState` |
| A file cited instead of a client quote (`proven_by_file_id`): a self-evident file settles or adds exactly one item of its type (the item then named with the company and employer — `selfEvidentItemName` — and carrying the file), or an approved property paper for the appendix change its seller kind implies | `DOC/decisionSchema.ts` · `validateProvenByFile` → `instancesOnSelfEvidentFile` (pools: `selfEvidentFilesOf`; `DOC/provenFacts.ts` · `approvedPropertyFilesOf`) |
| A cost the client stated in the chat (`stated_costs` / an instance's `stated_cost`): the item is a pending cost declaration, the quote is verbatim, the amount is written in the quote (checks `stated_cost_item_allows`, `stated_cost_amount_in_quote`) | `DOC/decisionSchema.ts` · `validateStatedCosts` (`statedCostTargetFault`, `amountAppearsIn`) |
| The apply phase: every accepted tool call is executed and recorded as its own step named after the tool, with its parameters (ids + names) and outcome — `reason` is the outcome line the trace row shows (openspec `conversation-trace`) | `DOC/plan.ts` · `recordToolStep`; detail builders `DOC/toolStepDetails.ts` |
| `set_required` — one step per call: resolved not_required / required (the rows created), or no change | `DOC/plan.ts` · `applyResolutions` (`DOC/toolStepDetails.ts` · `resolveDocumentDetail`) |
| `add_instance` — the row it created, its status, the files it named that code accepted / refused (written after the files are assigned) | `DOC/plan.ts` · `applyAdditions` (rows) → `recordAddInstanceSteps` (`addInstanceDetail`) |
| `set_company` — one step per call: a pending institution-bound row that named no company takes the company the client named ("<name> — <company>", the table's label or the client's text); gate checks `set_company_row_allows`, `set_company_in_quote`, `set_company_recognised`; audit `document.company_set`; the list is reloaded so an `add_instance` sibling of the same answer sits next to the renamed head (openspec `item-company-clarification`) | `DOC/decisionSchema.ts` · `validateSetCompanies` (`DOC/companyClarification.ts` · `companyRename`, `companyAppearsInQuote`) → `DOC/plan.ts` · `applyCompanies` (`clientDocuments.setCompanyName`; `setCompanyDetail`) |
| `retire_document` — one step per call; what replaced the row (other documents / the client's declaration — a statable paper of the row's type added or stated in the same answer) is derived in code, stored as `replaced_by` and shown in the step and the audit event (openspec `retired-by-declaration-tab`) | `DOC/plan.ts` · `applyRetirements` (`DOC/retirementReplacement.ts` · `replacementOfRetirement`; `retireDocumentDetail`) |
| `state_cost` — a cost declaration closed by the client's chat message: the row becomes `stated` with the statement as its evidence | `DOC/plan.ts` · `applyStatedCosts` (`clientDocuments.markStated`; `stateCostDetail`) |
| `state_vehicle` — the client's statement about a vehicle (make, model, year, plate, cost — any subset) merged into the vehicle declaration row, which becomes `stated`; a later statement adds facts | `DOC/plan.ts` · `applyVehicleDeclarations` (`clientDocuments.markStatedVehicle`, `vehicleDeclaration.ts` · `mergeVehicleEvidence`; `stateVehicleDetail`) |
| A changed checklist voids the attestation; reload; tell the accountant about rows born claimed | `DOC/plan.ts` · `settleChecklistChanges` |
| `attestation` (confirmed) | `DOC/plan.ts` · `applyAttestationConfirmed` (`attestationDetail`) |
| Which proposed file ties are allowed (split parents, company agreement) | `SH/fileEvidence.ts` · `applicableFilePairs`; `DOC/fileTies.ts` · `filterPairsByCompany` (`companyRefusal`, `paperRefusal`) |
| Split an item per company / employer | `DOC/plan.ts` · `splitItemsByCompany` → `DOC/companySplit.ts` · `planCompanySplit` (pure) |
| Files the model named for rows it just created | `DOC/fileTies.ts` · `assignFilesToNewRows` |
| Collect, claim, or leave pending? | `DOC/plan.ts` · `decideCollectOrClaim` |
| Mark collected / claimed | `DOC/plan.ts` · `markCollected`, `markClaimed` |
| Link each file under its document | `DOC/plan.ts` · `linkFilesToDocuments` |
| `tie_file` / `mark_collected` steps — the group outcome of `collectFiles` attributed to each call: tied, re-pointed to the row the split created (rename + siblings), refused (reason), ignored (unknown / quarantined / split parent); collected, claimed, pending (reason), unchanged, skipped after verification | `DOC/plan.ts` · `recordCollectionSteps` → `DOC/toolStepDetails.ts` · `attributeCollectionOutcome` (pure) |
| Which file each collected document is checked against | `DOC/plan.ts` · `pickVerificationTargets` |
| `conclude` (decision `collect`: reply withheld, the pairs being verified) → verify the batch → `planner.rerun_after_verification` → one follow-up cycle | `DOC/plan.ts` · `verifyThenReplan` (`recordConclude`, `concludeDetail`) → E, then `planFollowUp` again with `afterVerification` |
| `goal.completed` when every row is settled and the attestation is confirmed (the `conclude` step says "goal completed", derived or not); a premature goal_complete records `conclude` as premature and throws | `DOC/plan.ts` · `completeGoalIfDone` (`recordConclude`) |
| `send_closing`: the fixed closing message after completion (open 24h window only, never a template; both completion paths) | `DOC/plan.ts` · `sendClosingMessage` (`DOC/closingMessage.ts` · `closingMessageDelivery`) |
| Closing message text (thanks by first name, the accountant will be in touch if needed) | `DOC/closingMessage.ts` · `closingMessageText` |
| Is this inbound the intro template's decline button (payload `decline`, or exactly its text)? — handled in code, no planner call | `DOC/index.ts` · `onInboundMessage` → `DOC/clientDeclineRules.ts` · `isDeclineButton` (`DOC/clientDecline.ts` · `inboundMessageBody`) |
| `client_declined` answer: the client refused in words — conclude only, the gate rejects anything else | `DOC/decisionSchema.ts` · `normalizeDecision`; `DOC/plan.ts` · `planFollowUp` |
| `client.declined` → drop the pending send → `send_decline_ack` (fixed text, open window only) → `email.accountant_sent` (kind `declined`, missing documents) | `DOC/clientDeclineRules.ts` · `handleClientDeclineWith` (`DOC/clientDecline.ts` · `handleClientDecline`; `declineAckDelivery`, `declineAckText`, `missingDocumentNames`; `queries/clients.ts` · `markDeclined`; `DOC/notifyAccountant.ts` · `sendDeclinedEmail`) |
| Resume / new due date hands a declined or overdue-stopped client back to the agent | `api/workspace.ts` (paused route), `DOC/router.ts` (due-date route) · `queries/clients.ts` · `clearHandedOff`, `isHandedOff` |
| `email.accountant_sent` / `email.accountant_failed`: the platform email to the accountant (goal complete, claimed documents, verification problem, overdue), recorded in full on the trace (kind, to, subject, body, provider id, or the error) | `DOC/notifyAccountant.ts` · `sendToAccountant` (`DOC/notifyAccountantCore.ts` · `sendToAccountantWith`) |
| `ask_team` rules (openspec `team-questions`): only with a follow_up (the answer's message is the holding note), a non-blank question, never while a question is open, a cited message must be a real inbound | `DOC/decisionSchema.ts` · `validateTeamQuestion`, `refuseTeamQuestion` (open question in the context: `DOC/plan.ts` · `openTeamQuestionOf`) |
| Who answers: the client's stored tax advisor when matched (accountant / staff), else the accountant | `DOC/teamQuestions.ts` · `teamQuestionAddressee` (`accountantName`) |
| `ask_team` step: store the question (one open per client, DB-enforced), record the step, email the addressee (kind `team_question`, fire and forget) — before the holding message is scheduled | `DOC/plan.ts` · `applyAskTeam` (`queries/teamQuestions.ts` · `insert`; `DOC/toolStepDetails.ts` · `askTeamDetail`; `DOC/notifyAccountant.ts` · `sendTeamQuestionEmail`, text `DOC/teamQuestions.ts` · `teamQuestionEmail`) |
| TEAM QUESTIONS prompt section: each question open / answered / handled directly (last five, newest first) | `DOC/prompt.ts` · `buildTeamQuestionsSection` |
| A person closes the question on the questions tab (answer to relay, or "I answered the client myself" + note): first closing stands (409 for the second), `team_question.closed` audit, client update, one planner cycle under the lock (quiet for a paused / completed / declined client) | `api/workspace.ts` · close route handler (`queries/teamQuestions.ts` · `close`; viewer allow-list `api/viewerAccess.ts` · `viewerMayRequest`) |
| Delivery status of an accountant email, read live from Resend for the step modal | `api/llmAdmin.ts` · `adminGetStepEmailStatus` (`resend/deliveryStatus.ts` · `emailDeliveryStatus`) |
| `conclude` (decision `follow_up`), then `send_whatsapp_text` / `send_whatsapp_template`: roll the send time off weekends and chagim, resolve `asap` to now + 1 s, schedule the draft; the step records the requested and the scheduled time, the roll, the draft id, the template name and variables | `DOC/plan.ts` · `scheduleReply` (`SH/sendAtGuard.ts` · `rollBlockedSendAt`, `resolveSendAt`; `orchestration/scheduleDraftEmail.ts` · `scheduleDraftMessage`; `sendMessageDetail`) |
| `attestation` (request) on this draft | `DOC/plan.ts` · `applyAttestationRequest` (`attestationDetail`) |
| `tax_fetch`: the document-fetch action (agreed / start login / cancel) and whether a fetch context took it | `DOC/plan.ts` · `taxFetchDecisionOf` → `DOC/taxFetch/flow.ts` · `applyTaxFetchAction`; `DOC/plan.ts` · `recordTaxFetchStep` (`taxFetchDetail`) |
| Legacy trace rows `apply_*`, `send_reply`, `withhold_reply` (written before the per-tool steps): still rendered, no writer | `web/src/components/stepSummary.ts`, `stepGlyph.ts` |
| The scheduled send actually goes out | `queue/sendEmailWorker.ts` · `onScheduledSend` → `sendWhatsAppDraft` |
| After a delivered send, the next plan waits the after-send delay (the admin-set value, else `AFTER_SEND_PLAN_DELAY_SECONDS`); a client reply inside it replaces the wait with the normal turn, a send that did not go out re-plans at once | `queue/sendEmailWorker.ts` · `onScheduledSend` → `orchestration/requestReplan.ts` · `requestReplanAfterSend` (`orchestration/inboundTurnCore.ts` · `createAfterSendReplanRequester`) → `queue/replanWorker.ts` · `onReplan` |
| The three waits of the conversation (quiet window, maximum wait, after-send delay) are the admin-saved values from the settings page, each falling back to its env variable; read per decision, no restart | `orchestration/timingSettings.ts` · `getMessageTiming` (`orchestration/timingRules.ts` · `resolveMessageTiming` / `validateMessageTiming`); `api/admin.ts` · `adminGetMessageTiming` / `adminSetMessageTiming` |
| What the workspace shows: "processing" while a processing stamp is fresh (webhook, file analysis, verification batch, the worker's wait for work), "drafting" while a drafting stamp is fresh (the planner, a manual redraft, the follow-up cycle after verification), nothing while a run is only queued (quiet window, after-send wait), stuck/failed/held as before | `web/src/components/turnActivity.ts` · `resolveTurnActivity`; stamps `db/queries/clients.ts` · `markProcessingStarted` / `clearProcessing` / `markDraftingStarted`; `orchestration/inboundTurnRules.ts` · `waitKindOf`; `api/workspace.ts` GET client → `orchestration/requestReplan.ts` · `queuedReplanUntil` |
| During that wait the workspace shows the client as silent, not drafting: the client read serves the wait's due time and the timeline ends at the delivered message (no placeholder, no stuck notice); the page refetches when the wait is due | `api/workspace.ts` · GET `/clients/:id` → `orchestration/requestReplan.ts` · `afterSendWaitUntil` (`orchestration/inboundTurnCore.ts` · `afterSendDueAt`) → `web/src/components/ClientView.tsx` · `waitingAfterSend` |
| First delivered message starts the collection window: the client's due date = local delivery date + `collection_window_days`, unless a date is already set | `queue/sendEmailWorker.ts` · `onFirstContact` → `DOC/collectionWindow.ts` · `startCollectionWindow` (`dueDateFromWindow`, `clients.setDueDateIfAbsent`) |

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

## H. A model provider outage (openspec `llm-provider-outage`)

| Step | File · function |
| --- | --- |
| Before every call: a held provider gets no request (healthy backup → straight to it; nothing free → refused) | `gemini/llmCall.ts` · `runLlmCall` → `gemini/outageRules.ts` · `routeUnderHold` |
| After every model of a call failed: does the failure prove an outage kind (billing, auth, quota, rate limit, server, unreachable, budget)? | `gemini/outageRules.ts` · `outageKindOf`, `holdsAfterFailures` |
| Open the hold (once): critical alert + platform audit row | `gemini/llmCall.ts` · `holdAfterFailure` → `gemini/providerOutage.ts` · `openHold` |
| A stage's work stops on the hold: client marked held, one `outage.held` step per turn | `orchestration/outageHold.ts` · `holdClientForOutage` |
| Planner run hits the hold: held, not draft-failed | `orchestration/setFutureEmail.ts` · `setFutureEmail` (catch) |
| Verification hits the hold: the batch aborts | `DOC/verifyBatchRules.ts` · `runVerificationBatch` (`abortOn`); `DOC/verifyDocument.ts` · `extractDocumentData`, `verifyBatchAndReplan` |
| Probe each held provider every `LLM_OUTAGE_PROBE_SECONDS` (admin "retry now" runs the same round) | `queue/outageProbeWorker.ts` · `runOutageProbeTick` → `orchestration/outageRecovery.ts` · `probeAllHolds` → `gemini/outageProbe.ts` · `probeProvider` |
| Probe answered: release the hold, recover, report | `gemini/providerOutage.ts` · `releaseHold`, `reportRecovered` |
| Recovery per client: re-screen waiting messages, re-analyze held files, re-verify cut-short documents, one replan | `orchestration/outageRecovery.ts` · `createOutageRecovery` (`recoverFromOutage`); `DOC/index.ts` · `rescreenInboundMessage`, `analyzeInboundFile`; `DOC/outageReverify.ts` · `reverifyCollected` |
| Boot: held clients' turns re-requested | `queue/replanWorker.ts` · `recoverLostReplans` |
| The one calm acknowledgement after `LLM_OUTAGE_ACK_AFTER_SECONDS` | `orchestration/outageRecovery.ts` · `acknowledgeHeldClients` |
| Admin: the holds and clients waiting; retry now | `api/admin.ts` · `adminGetLlmOutage`, `adminProbeLlmOutage`; `web/src/components/admin/OutageBar.tsx` |
