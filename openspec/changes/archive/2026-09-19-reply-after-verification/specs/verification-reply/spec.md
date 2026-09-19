## Purpose

Defines how the agent's reply relates to document verification: the agent does not draft a reply between marking a document as collected and receiving its verification verdict, and it runs one follow-up planning cycle per batch of verifications.

## ADDED Requirements

### Requirement: No draft before the verdicts
When a planning cycle marks one or more documents as collected, the system SHALL NOT store or schedule a draft from that cycle. The reply SHALL be drafted only after every just-collected document of the cycle has a verification outcome.

#### Scenario: Client sends a valid document
- **WHEN** a client sends a file, the planning cycle marks its document as collected, and verification approves it
- **THEN** exactly one draft is stored for the turn, it is written after the approval, and no earlier draft of the turn exists in the timeline

#### Scenario: Client sends a document that fails verification
- **WHEN** a client sends a file, the planning cycle marks its document as collected, and verification reopens the document
- **THEN** no message that treats the document as received is drafted or sent, and the single draft of the turn asks for a corrected document

#### Scenario: Cycle collects nothing
- **WHEN** a planning cycle marks no document as collected
- **THEN** its draft is stored and scheduled as before, with no follow-up cycle

### Requirement: One follow-up planning cycle per verification batch
After the verification of all just-collected documents of one cycle, the system SHALL run exactly one follow-up planning cycle. A single verification verdict SHALL NOT start a planning cycle by itself. The follow-up cycle SHALL NOT mark documents as collected.

#### Scenario: Three documents collected in one turn
- **WHEN** a planning cycle marks three documents as collected
- **THEN** three verifications run, then one follow-up planning cycle runs, and the turn ends with one draft

#### Scenario: Follow-up cycle cannot loop
- **WHEN** the follow-up planning cycle proposes to mark a document as collected
- **THEN** the proposal is ignored and no further verification or planning cycle starts

### Requirement: State changes of the collecting cycle still apply
The planning cycle that collects documents SHALL apply all of its validated state changes that do not depend on a message (intake resolutions, added and retired documents, a confirmed attestation, file links, claimed documents) even though its draft is withheld. Actions that are bound to the message of the cycle (an attestation request, a document-fetch action) SHALL NOT be applied by that cycle; the follow-up cycle decides them again.

#### Scenario: Collected document and a resolved intake row in one cycle
- **WHEN** a planning cycle marks one document as collected and resolves another row as not required
- **THEN** both changes are stored before verification starts, and the follow-up cycle sees both

#### Scenario: Client agrees to a document fetch and sends a file in the same turn
- **WHEN** the collecting cycle proposes the client-agreed fetch action and its draft is withheld
- **THEN** no fetch session state changes in that cycle, and the follow-up cycle applies the fetch action together with the message it drafts

### Requirement: The follow-up cycle knows the verdicts of this turn
The follow-up planning cycle SHALL be given, for every document of the batch, the document, the file that was verified, the outcome, and the failure reasons when the file was rejected. The reply SHALL report a rejected file as rejected, with its reason, and SHALL NOT describe it as received, pending, or still being checked.

#### Scenario: Two files of this turn are rejected
- **WHEN** a client sends two files in one turn and verification rejects both
- **THEN** the single reply names both documents as not accepted, gives the reason, and asks for corrected documents

#### Scenario: One approved and one rejected
- **WHEN** a client sends two files in one turn, one is approved and one is rejected
- **THEN** the single reply confirms the approved document and asks for a corrected version of the rejected one

#### Scenario: Verification could not run
- **WHEN** the verification of a file was skipped or ended with an error
- **THEN** the reply treats that file as received and not yet verified, and does not call it approved or rejected

### Requirement: A verification problem never blocks the reply
If the verification of a document ends with an error, or is skipped because the platform kill switch is on, the follow-up planning cycle SHALL still run once the rest of the batch is finished.

#### Scenario: Verification throws
- **WHEN** one of two verifications throws an error
- **THEN** the other verification still runs, the follow-up planning cycle runs once, and the error is logged

### Requirement: Fetched documents are verified as one batch
When the document-fetch delivery marks several fetched documents as collected, the system SHALL verify them as one batch and SHALL run one follow-up planning cycle after the batch.

#### Scenario: Fetch delivers two documents
- **WHEN** a fetch session delivers two documents for a client
- **THEN** both are verified, and exactly one planning cycle runs afterwards

### Requirement: The turn stays visibly in progress
From the start of the collecting cycle until the follow-up cycle has ended, the workspace SHALL show the client as drafting.

#### Scenario: Accountant opens the client during verification
- **WHEN** the accountant opens the client while verification of a just-collected document is running
- **THEN** the client shows the drafting state and no scheduled message

### Requirement: The withheld draft and the follow-up are audited
The system SHALL record one audit step when a draft is withheld because documents were collected, and one `planner.rerun_after_verification` step per batch that names every document of the batch with its outcome.

#### Scenario: Trail of a collecting turn
- **WHEN** a turn collects two documents
- **THEN** the trail shows the withheld-draft step, the two verification results, one follow-up step naming both documents, and then the message steps of the single draft
