# verification-reply Specification

## Purpose
Defines how the agent's reply relates to document verification: the agent does not draft a reply between marking a document as collected and receiving its verification verdict, and it runs one follow-up planning cycle per batch of verifications.

## Requirements

### Requirement: No draft before the verdicts
A reply SHALL be drafted only after every document the planner tied in the same run has a verification outcome. The system SHALL achieve this inside one planner run: a tie is verified when its tool call is executed and the verdict is returned to the model as the call's result, so the model writes the message afterwards with every verdict in view. There SHALL be no separate collecting answer and no decision label; a run that ties files and then schedules its message is the normal case. A message call made in the same turn as a tie SHALL be executed after the tie's verification, and the model SHALL be told in the message call's result that it sent before reading the verdict; the prompt SHALL tell the model to send only after the tie results.

#### Scenario: Client sends a valid document
- **WHEN** a client sends a file, the planner ties it and verification approves it
- **THEN** exactly one draft is stored for the turn, written after the approval, and no earlier draft of the turn exists in the timeline

#### Scenario: Client sends a document that fails verification
- **WHEN** a client sends a file, the planner ties it and verification reopens the document
- **THEN** no message that treats the document as received is drafted, and the single draft of the turn asks for a corrected document with the reason

#### Scenario: Cycle collects nothing
- **WHEN** a planner run ties no file
- **THEN** its message is stored and scheduled as before, with no extra cycle

#### Scenario: Model collects and writes a message in one answer
- **WHEN** the model's single turn carries `tie_file(F, D)` and `send_whatsapp_text(...)` together
- **THEN** the tie is executed and verified first, the message is scheduled as written, the run ends, and the send call's result and step say the message was written before the verdict was known

#### Scenario: Model gives no message and collects nothing
- **WHEN** the model's turn is text only and the run has no ending yet
- **THEN** the system sends one corrective turn and the model's next turn schedules the message; a second text-only turn fails the run

### Requirement: One follow-up planning cycle per verification batch
A planner tie SHALL NOT start a follow-up planning cycle: the same run continues after the verdict. The follow-up cycle SHALL remain only for documents a website fetch delivered: after that batch is verified the system SHALL run exactly one planner run, whose prompt lists the batch's verdicts in the VERIFICATION RESULTS section. That run SHALL be an ordinary run: it may tie other files, and such ties are verified inside the run like any other.

#### Scenario: Three documents collected in one turn
- **WHEN** the planner ties three files in one run
- **THEN** three verifications run inside the run (as one batch when they share a turn), the model gets three verdicts, and the run ends with one draft

#### Scenario: Collecting answer whose ties are all refused
- **WHEN** the model's turn pairs one file with a document and the code refuses the pair
- **THEN** no verification runs, the call's result says why it was refused, and the same run goes on to its message

#### Scenario: Follow-up cycle cannot loop
- **WHEN** the planner run after a fetch-delivery batch ties another received file
- **THEN** that tie is verified inside the run and answered with its verdict, and no further planning cycle starts

#### Scenario: Fetch delivers two documents
- **WHEN** a fetch session delivers two documents for a client
- **THEN** both are verified, then exactly one planner run follows with both verdicts in its prompt

### Requirement: State changes of the collecting cycle still apply
Every accepted call of a run SHALL be applied when it is executed, before the model's next turn, whether or not the run later ends well. A run that fails after applying ties or checklist changes SHALL leave those changes in place and SHALL record the failure; the next run sees the changed state. An attestation request and a document-fetch action SHALL ride on the run's message as today, taken from the accepted calls of the run.

#### Scenario: Collected document and a resolved intake row in one cycle
- **WHEN** a turn ties one document and resolves another row as not required
- **THEN** both changes are stored before the tie's verification starts, and the model's next turn sees both in its results

#### Scenario: Client agrees to a document fetch and sends a file in the same turn
- **WHEN** the model ties the file and calls `document_fetch(client_agreed, ...)` and then sends in a later turn
- **THEN** the tie is verified and answered, the fetch action is applied together with the scheduled message, and the run ends with one draft

#### Scenario: Run fails after a tie
- **WHEN** the planner ties a file, the file is approved, and the run then fails on the ending rule
- **THEN** the document stays approved, no message is scheduled, and the failure is recorded on the trace

### Requirement: The follow-up cycle knows the verdicts of this turn
The model SHALL know the verdict of every document tied in the run from the tie's result text (the document, the file, the outcome, the failure reasons when rejected, and the key facts read when approved), and the verdict of every fetched document from the VERIFICATION RESULTS section of the prompt. In both cases the reply SHALL report a rejected file as rejected, with its reason, and SHALL NOT describe it as received, pending, or still being checked; a file whose check could not run SHALL be described as received and not yet verified.

#### Scenario: Two files of this turn are rejected
- **WHEN** a client sends two files in one turn, the model ties both and verification rejects both
- **THEN** the two results carry the reasons and the single reply names both documents as not accepted, gives the reasons, and asks for corrected documents

#### Scenario: One approved and one rejected
- **WHEN** the planner ties two files in one run, one is approved and one rejected
- **THEN** the single reply confirms the approved document and asks for a corrected version of the rejected one, with the reason

#### Scenario: Verification could not run
- **WHEN** the verification of a tied file was skipped or ended with an error
- **THEN** the tie's result says the file was received and not yet checked, and the reply treats it so, never as approved or rejected

#### Scenario: Empty batch
- **WHEN** the planner run after a fetch delivery has no verified document in its batch
- **THEN** the VERIFICATION RESULTS section says no file of that batch was verified, and the run ends with a message like any other

### Requirement: Fetched documents are verified as one batch
When the document-fetch delivery marks several fetched documents as collected, the system SHALL verify them as one batch and SHALL run one follow-up planning cycle after the batch.

#### Scenario: Fetch delivers two documents
- **WHEN** a fetch session delivers two documents for a client
- **THEN** both are verified, and exactly one planning cycle runs afterwards

### Requirement: The turn stays visibly in progress
From the start of the planner run until its message is scheduled, the workspace SHALL show the client as busy, never idle and never stuck: the drafting notice while the model is answering, the processing notice while a tie's documents are verified (refreshed per document), and the drafting notice again when the model's next turn starts.

#### Scenario: Accountant opens the client during verification
- **WHEN** the accountant opens the client while the file of a tie is being verified
- **THEN** the client shows the processing notice and no scheduled message

#### Scenario: Verification ends, follow-up cycle runs
- **WHEN** the last document of a turn's ties is verified and the model's next turn starts
- **THEN** the processing notice turns into the drafting notice until the reply is scheduled

### Requirement: The withheld draft and the follow-up are audited
The system SHALL record the verdict of a planner tie on the `tie_file` (or `mark_collected` / `add_instance`) step itself, together with the result text returned to the model, and SHALL record the `verify_extraction` rows as today. The `planner.rerun_after_verification` step SHALL be written only for a fetch-delivery batch. The deferred-reply step SHALL NOT be written any more; older rows stay readable with their current label.

#### Scenario: Trail of a collecting turn
- **WHEN** a run ties two documents and then sends
- **THEN** the trail shows the first turn's `validate_message` row, two tie steps each with its verdict, the two `verify_extraction` rows, the second turn's `validate_message` row, the message step and the `conclude` step, and no deferred-reply or rerun step

#### Scenario: Older trail
- **WHEN** an admin opens a trail recorded before this change
- **THEN** its withheld-draft step still shows with the deferred-reply label
