## MODIFIED Requirements

### Requirement: The client hears one fixed acknowledgement
On a decline, the system SHALL send the client one fixed Hebrew acknowledgement, immediately. It SHALL say that the assistant understood and will stop sending messages, SHALL name the tax advisor stored on the client as the person who handles the case, SHALL give the advisor's email address, SHALL ask the client to send the documents to that address, and SHALL list every document still missing (the pending and never-resolved items of the client's document list, by their list names), whatever their number. When no document is missing, the list SHALL be left out and the message SHALL only point the client to the advisor. A client that has no stored advisor (an admin test client, or a client started before advisors were required) SHALL be given the accountant's name and login email instead. The acknowledgement SHALL be sent only while the 24-hour window is open (it always is right after the client's message); when it cannot be sent, the decline SHALL still be handled and the reason recorded in the trace. The acknowledgement SHALL appear in the timeline as a sent message, and the trace SHALL show a `send_decline_ack` step.

#### Scenario: Acknowledgement text
- **WHEN** client "ישראל כהן" declines, the client's stored tax advisor is "דנה לוי" with email dana@office.co.il, and two documents are missing: "דוח שנתי מבנק הפועלים" and "אישור יתרות קופת גמל"
- **THEN** the client receives one message saying the assistant understood and will stop writing, that דנה לוי handles the case, that the documents can be sent to dana@office.co.il, and naming the two missing documents, and the timeline shows it

#### Scenario: Long list
- **WHEN** a client with 18 missing documents declines
- **THEN** the message lists all 18 documents

#### Scenario: Nothing missing
- **WHEN** a client whose every document is approved or not required declines
- **THEN** the message names the advisor and the address and has no document list

#### Scenario: Test client without an advisor
- **WHEN** an admin test client, which has no stored advisor, declines
- **THEN** the message names the accountant and gives the accountant's login email as the address

#### Scenario: No sender available
- **WHEN** the client declines while the instance has no WhatsApp sender
- **THEN** no message is sent, the client is still stopped and the accountant still emailed, and the trace step records why the acknowledgement was skipped
