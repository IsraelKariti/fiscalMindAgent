## Purpose

Defines how a file a client sends (WhatsApp media, email attachment) is fetched from the messaging provider and stored, what happens when that fails, and how a lost file is surfaced to admins in the trace and to the planner.

## ADDED Requirements

### Requirement: A failed file download is retried before giving up
When fetching or storing a file a client sent fails, the system SHALL retry the whole fetch-and-store of that file a bounded number of times (at least three attempts in total) with a short pause between attempts, before treating the file as lost. Retries SHALL NOT create duplicate stored files: an attempt that succeeds after an earlier partial attempt yields exactly one stored file. A lost file SHALL NOT stop the other files of the same message from being stored, and SHALL NOT prevent the message itself from being handled.

#### Scenario: Second attempt succeeds
- **WHEN** a client sends a PDF over WhatsApp and the first download from the provider fails with a network error
- **THEN** the download is tried again after a short pause, the file is stored once, analysed as usual, and no failure step is recorded

#### Scenario: Every attempt fails
- **WHEN** every attempt to fetch or store the file fails
- **THEN** the file is treated as lost, the message is still stored and the client's turn still proceeds to the planner

#### Scenario: One of several files fails
- **WHEN** an email carries three attachments and only the second one cannot be fetched after all attempts
- **THEN** the first and third attachments are stored and analysed, and only the second is treated as lost

#### Scenario: Provider retry after a lost file
- **WHEN** the provider redelivers the same webhook after a file was treated as lost
- **THEN** the file is fetched again and, if it now succeeds, stored once, exactly like a file that had never failed

### Requirement: A lost file is recorded as a trace step
When a file is treated as lost, the system SHALL record an audited step for the client (action `file.ingest_failed`, severity warning) that names: the channel (whatsapp or email), the inbound message it belongs to, the file's position in the message, the file's content type, the file name hint when the message carries one (the attachment file name for email; for WhatsApp, the message text, which is the caption or document name), the number of attempts made, and the error of the last attempt. The step SHALL appear in the admin conversation trace like every other code step, and its modal SHALL show those fields as labelled rows. Accountants SHALL NOT see it (trace visibility is unchanged). The failure SHALL still be written to the process log.

#### Scenario: Lost WhatsApp document
- **WHEN** a WhatsApp document named "contract.pdf" cannot be fetched after all attempts
- **THEN** the admin trace of that client shows a `file.ingest_failed` step under the message, and its modal shows channel whatsapp, the file name hint "contract.pdf", type application/pdf, the number of attempts and the last error

#### Scenario: Stored file records no failure step
- **WHEN** a file is stored on any attempt
- **THEN** no `file.ingest_failed` step is recorded for it

#### Scenario: Accountant view
- **WHEN** an accountant opens the client's conversation
- **THEN** they see the client's message as today and no trace step

### Requirement: The planner is told about a lost file
The planner's thread transcript SHALL state, under the inbound message it belongs to, that a file sent with that message could not be stored and is not available, so the reply asks the client to send it again. The note SHALL be shown only while the file is still missing: once the same file is later stored (a provider redelivery or a manual re-ingest), the transcript lists the stored file and no lost-file note.

#### Scenario: Planner drafts after a lost file
- **WHEN** the planner runs for a turn in which a WhatsApp document was treated as lost
- **THEN** the transcript entry of that message carries a note that one file (with its type and name hint) could not be stored and is not available, and no attachment line for it

#### Scenario: Lost file later stored
- **WHEN** a file that was treated as lost is stored by a later delivery of the same message
- **THEN** the transcript shows the stored file with its analysis and no lost-file note for that message
