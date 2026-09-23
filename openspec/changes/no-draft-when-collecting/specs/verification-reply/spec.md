## MODIFIED Requirements

### Requirement: No draft before the verdicts
A planning answer that marks one or more documents as collected, pairs a file with a document, or names a file for a newly created document SHALL be a collecting answer. A collecting answer SHALL carry no message, no send time, no attestation request and no document-fetch action. The system SHALL reject an answer that both collects and carries a message, and an answer that carries no message and collects nothing, and SHALL ask the model for one corrected answer before failing the cycle. The reply SHALL be drafted only after every just-collected document of the cycle has a verification outcome.

#### Scenario: Client sends a valid document
- **WHEN** a client sends a file, the planning cycle marks its document as collected, and verification approves it
- **THEN** the collecting answer holds no message text, exactly one draft is stored for the turn, it is written after the approval, and no earlier draft of the turn exists in the timeline

#### Scenario: Client sends a document that fails verification
- **WHEN** a client sends a file, the planning cycle marks its document as collected, and verification reopens the document
- **THEN** no message that treats the document as received is drafted or sent, and the single draft of the turn asks for a corrected document

#### Scenario: Cycle collects nothing
- **WHEN** a planning cycle marks no document as collected and pairs no file
- **THEN** its answer carries a message, and the draft is stored and scheduled as before, with no follow-up cycle

#### Scenario: Model collects and writes a message in one answer
- **WHEN** the model's answer marks a document as collected and also carries message text
- **THEN** the answer is rejected, the model is asked once for a corrected answer, and the corrected answer is applied if it follows the rule

#### Scenario: Model gives no message and collects nothing
- **WHEN** the model's answer carries no message and ties no file to any document
- **THEN** the answer is rejected and the model is asked once for a corrected answer

### Requirement: One follow-up planning cycle per verification batch
After a collecting answer, the system SHALL verify every just-collected document that has a file and SHALL then run exactly one follow-up planning cycle, also when no document reached verification because the code refused every tie or every collected document was claimed without a file. A single verification verdict SHALL NOT start a planning cycle by itself. The follow-up cycle SHALL NOT be offered the collecting answer, and any file tie or collected mark in its answer SHALL be ignored.

#### Scenario: Three documents collected in one turn
- **WHEN** a planning cycle marks three documents as collected
- **THEN** three verifications run, then one follow-up planning cycle runs, and the turn ends with one draft

#### Scenario: Collecting answer whose ties are all refused
- **WHEN** the model's collecting answer pairs one file with a document and the code refuses the pair
- **THEN** no verification runs, one follow-up planning cycle runs at once, and the turn ends with one draft

#### Scenario: Follow-up cycle cannot loop
- **WHEN** the follow-up planning cycle answers
- **THEN** the collecting answer is not among the values it may choose, a collected mark or file tie in its answer is ignored, and no further verification or planning cycle starts

### Requirement: State changes of the collecting cycle still apply
The collecting answer SHALL apply all of its validated state changes that do not depend on a message (intake resolutions, added and retired documents, a confirmed attestation, file links, claimed documents). A collecting answer SHALL NOT carry an attestation request or a document-fetch action; the follow-up cycle decides them.

#### Scenario: Collected document and a resolved intake row in one cycle
- **WHEN** a planning cycle marks one document as collected and resolves another row as not required
- **THEN** both changes are stored before verification starts, and the follow-up cycle sees both

#### Scenario: Client agrees to a document fetch and sends a file in the same turn
- **WHEN** the collecting answer is given for a turn in which the client also agreed to a document fetch
- **THEN** the collecting answer holds no fetch action, no fetch session state changes in that cycle, and the follow-up cycle applies the fetch action together with the message it drafts

### Requirement: The follow-up cycle knows the verdicts of this turn
The follow-up planning cycle SHALL be given, for every document of the batch, the document, the file that was verified, the outcome, and the failure reasons when the file was rejected. When the batch is empty, the follow-up cycle SHALL be told that no file of this turn was verified and that it must not collect. The reply SHALL report a rejected file as rejected, with its reason, and SHALL NOT describe it as received, pending, or still being checked.

#### Scenario: Two files of this turn are rejected
- **WHEN** a client sends two files in one turn and verification rejects both
- **THEN** the single reply names both documents as not accepted, gives the reason, and asks for corrected documents

#### Scenario: One approved and one rejected
- **WHEN** a client sends two files in one turn, one is approved and one is rejected
- **THEN** the single reply confirms the approved document and asks for a corrected version of the rejected one

#### Scenario: Verification could not run
- **WHEN** the verification of a file was skipped or ended with an error
- **THEN** the reply treats that file as received and not yet verified, and does not call it approved or rejected

#### Scenario: Empty batch
- **WHEN** the follow-up cycle runs after a collecting answer whose batch is empty
- **THEN** its input says that no file was verified in this turn, and its answer carries a message

### Requirement: The withheld draft and the follow-up are audited
The system SHALL record one audit step when a collecting answer defers the reply, naming the documents it collected, and one `planner.rerun_after_verification` step per batch that names every document of the batch with its outcome. The deferred-reply step SHALL keep the key of the former withheld-draft step, so older trails read the same, and its label SHALL say that the reply is deferred until verification, not that a draft was withheld.

#### Scenario: Trail of a collecting turn
- **WHEN** a turn collects two documents
- **THEN** the trail shows the deferred-reply step, the two verification results, one follow-up step naming both documents, and then the message steps of the single draft

#### Scenario: Older trail
- **WHEN** an admin opens a trail recorded before this change
- **THEN** its withheld-draft step still shows with the deferred-reply label
