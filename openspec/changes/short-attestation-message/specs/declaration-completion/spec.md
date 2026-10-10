## Purpose
Defines what the client hears when the capital-declaration list is settled: the content of the closing summary that asks the client to confirm the list is complete, the confirmation that completes the goal, and the closing message sent after it.

## ADDED Requirements

### Requirement: The closing summary asks only for the completeness confirmation
When every item of the list is settled (approved or not required) and no summary was sent yet, the agent's next message SHALL be the closing summary. The summary SHALL contain, in this order: a short thank-you, the items the client said they do **not** have (one line per item, in the client's everyday words), and one explicit question asking the client to confirm that the list is complete and that they have no other assets or liabilities. The summary SHALL NOT list the documents that were received and verified, and SHALL NOT present a prior declaration kept at the office as something the client does not have. The summary SHALL end with that one question and no other request.

#### Scenario: Client declared several items they do not have
- **WHEN** the list is settled with two approved documents and five items marked not required on the client's words
- **THEN** the summary names the five items, names none of the two documents, and ends with one confirmation question

#### Scenario: Client declared nothing missing
- **WHEN** the list is settled and every item was approved (no item is marked not required on the client's words)
- **THEN** the summary is the thank-you and the single confirmation question only

#### Scenario: Prior declaration kept at the office
- **WHEN** the list is settled and the prior-declaration item is marked not required because the office holds it
- **THEN** the summary does not list the prior declaration among the items the client does not have

### Requirement: The confirmation completes the goal
The goal SHALL complete only when the client replies to the sent summary with an explicit confirmation, cited by the message id and a verbatim quote of a message that is later than the summary. A reply that adds an asset or liability instead SHALL NOT confirm; the added item is handled and the summary is sent again later.

#### Scenario: Client confirms
- **WHEN** the client replies "מאשר, אין לי נכסים נוספים" after the summary was delivered
- **THEN** the attestation is confirmed with that message as evidence and the goal completes

#### Scenario: Client adds an item
- **WHEN** the client replies "רגע, יש לי גם רכב" after the summary was delivered
- **THEN** the attestation is not confirmed, a vehicle item is added to the list, and collection continues

### Requirement: A closing message follows the completion
When the goal completes and the client can receive a free-form WhatsApp message (an open 24h window and a configured sender), the agent SHALL send the client one closing message immediately: it thanks the client by first name and says the accountant will contact them if anything else is needed. The message SHALL be sent at most once per completion, SHALL appear in the client's timeline as a sent outbound message, and SHALL NOT be followed by any further scheduled message. When the client cannot receive a free-form WhatsApp message, no closing message is sent and the goal still completes.

#### Scenario: Completion right after the client's confirmation
- **WHEN** the client's confirmation completes the goal within the 24h window
- **THEN** one closing message is sent at once, the timeline shows it as sent, and no further message is scheduled

#### Scenario: Accountant settles the last item manually inside the window
- **WHEN** the attestation is confirmed, the accountant marks the last pending item as approved from the workspace, and the client wrote within the last 24 hours
- **THEN** the goal completes and the same closing message is sent once

#### Scenario: Accountant settles the last item manually outside the window
- **WHEN** the attestation is confirmed, the accountant marks the last pending item as approved from the workspace, and the client's last message is older than 24 hours
- **THEN** the goal completes, no closing message is sent, and no template is sent in its place

#### Scenario: Sending the closing message fails
- **WHEN** the WhatsApp provider rejects the closing message
- **THEN** the goal still completes, the accountant notification is still sent, and the failure is logged without retrying the client message
