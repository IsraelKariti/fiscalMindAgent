## Purpose

How the agent asks the client's team member a question it cannot answer itself, how that person answers inside the app, and how the agent carries the answer back to the client: the question record, the email, the questions tab on the client's page, the sidebar badge and chip, the planner's rules for asking and relaying, and the trace steps.

## ADDED Requirements

### Requirement: The planner may ask the team one question
In a `follow_up` answer the planner SHALL be able to ask the client's team one question, giving the question text and a short reason. The answer SHALL still carry its one WhatsApp message to the client, which tells the client that the office is being consulted and will come back to them; that message's send time SHALL be "as soon as possible". The system SHALL reject an answer that asks the team while a question for that client is still open, that asks more than once, that asks with an empty question, or that asks in an answer whose decision is not `follow_up`; it SHALL ask the model for one corrected answer before failing the cycle, as for the other answer rules. A question SHALL be asked only for something the client raised that the agent cannot settle from its instructions and the client's file: the office's practice, an unusual document, a tax or accounting judgement. A clarification question about a checklist item, a question answered in the agent's own knowledge base, and small talk SHALL NOT be sent to the team. An accepted ask SHALL be recorded on the client's trace as an `ask_team` step with the question, the reason, the addressee and the question's id.

#### Scenario: Client asks about the office's practice
- **WHEN** the client writes that his previous capital declaration was prepared by another office and asks whether the office needs it, and the agent's instructions do not settle it
- **THEN** the planner's answer asks the team that question with the client's words as the reason, sends the client a short message saying it will check with the office and come back, and the trace shows an `ask_team` step followed by the message step

#### Scenario: Question already open
- **WHEN** a question for the client is still unanswered and the planner's answer asks the team again
- **THEN** the gate rejects the answer naming the open question, and the corrected answer tells the client the office is still checking without asking again

#### Scenario: Ask without a message
- **WHEN** the planner's answer asks the team with a `collect` decision or without a `send_*` call
- **THEN** the gate rejects the answer

#### Scenario: Answered in the knowledge base
- **WHEN** the client asks why a bank balance must be as of 31 December
- **THEN** the planner answers from its instructions and asks the team nothing

### Requirement: The question is addressed to the client's team member
A question SHALL be addressed to the client's stored tax advisor when that advisor is matched to the accountant or to a staff entry; when the client has no stored advisor, or the advisor is unmatched, the question SHALL be addressed to the accountant. The record SHALL keep the addressee's name and email address, the time asked, and the question and reason text. The addressee SHALL receive one email naming the client, the question, the agent's reason and a link to the app, sent from the platform's no-reply address and recorded on the client's trace with the kind `team_question`, the recipient, the subject, the body and the provider id, or a warning step with the error when the send fails. A failed email SHALL NOT fail the planning cycle and SHALL NOT remove the question: the question stays open and answerable in the app.

#### Scenario: Advisor is a staff member
- **WHEN** the client's advisor is matched to a staff entry and the planner asks the team
- **THEN** the question is addressed to that staff member's email and name, and the email goes to that address

#### Scenario: Advisor unmatched
- **WHEN** the client's advisor is stored as "not on the staff list"
- **THEN** the question is addressed to the accountant and the email goes to the accountant's sign-in address

#### Scenario: No advisor
- **WHEN** the client was enrolled from a board without an advisor column
- **THEN** the question is addressed to the accountant

#### Scenario: Email fails
- **WHEN** the mail provider rejects the send
- **THEN** the trace holds a warning step with the error, the question is open in the app, and the client's holding message is still sent

### Requirement: The client's page has a questions tab
The client's page SHALL have a "questions" tab next to the conversation and documents tabs, shown to the accountant, to a staff viewer and to an admin viewing as the accountant, on the standalone app and in the monday custom object. While the client has an open question the tab label SHALL carry a count badge. The tab SHALL list the client's questions newest first; each card SHALL show the question, the reason, the client's quoted message when the question rests on one (with a link that opens that message in the conversation tab), the addressee's name, the time asked, and, once closed, either the answer with the answerer's name and the time, or "answered the client directly" with the closer's name, the time and the note when one was written. An open question SHALL show an answer box with a send control, and a second control "I answered the client myself" that opens an optional note field and a confirm control; a blank answer SHALL NOT be sendable through the first control. When the client has no questions the tab SHALL show a short empty-state line. The questions SHALL NOT appear in the WhatsApp thread and SHALL NOT be sent to the client. The tab SHALL refresh when the client's state changes, like the chat.

#### Scenario: Open question
- **WHEN** a staff viewer opens a client whose agent asked a question an hour ago
- **THEN** the questions tab label shows a badge with 1, and the tab shows one card: the question, the reason, the client's quoted message, the viewer's name as the addressee, the time, and an answer box

#### Scenario: Quoted message link
- **WHEN** the viewer presses the quoted message on the card
- **THEN** the conversation tab opens scrolled to that message

#### Scenario: Answered question
- **WHEN** the accountant opens a client whose question was answered yesterday by a staff member
- **THEN** the tab label carries no badge, and the card shows the question and the answer with the staff member's name and the time, and no answer box

#### Scenario: Question handled on the phone
- **WHEN** the accountant opens a client whose question a staff member closed as "answered the client directly" with the note "told him we have the 2019 declaration"
- **THEN** the card shows the question, "answered the client directly" with the staff member's name and the time, the note, and no controls

#### Scenario: No questions
- **WHEN** the accountant opens the questions tab of a client the agent never asked about
- **THEN** the tab shows the empty-state line and no cards

### Requirement: Closing a question wakes the agent
A question SHALL be closed in one of two ways: by an answer for the agent to relay (the answer text is required), or as "answered the client directly" when the team member already spoke to the client by phone or in person (a note of what was said is optional). Closing SHALL store the way, the text, the closing user and the time. The request SHALL be accepted from the accountant, from a staff viewer of that accountant and from an admin viewing as the accountant; it SHALL be refused with a clear error when the question is already closed, when an answer is blank, or when the question does not belong to the client named in the request. On success the system SHALL record a `team_question.closed` audit step with the acting user as the actor and the question id, the way, the text length and the closer's name in the detail, SHALL publish the client's update so open pages refresh, and SHALL run one planner cycle for the client. When the client is paused the closing SHALL be stored and the cycle SHALL run on the next resume, as any re-plan does for a paused client. A second closing of the same question SHALL be refused; the first stands.

#### Scenario: Staff member answers
- **WHEN** a staff viewer types an answer and sends it
- **THEN** the card shows the answer with the viewer's name, the trace shows a `team_question.closed` step with the viewer as the actor and the way "answered", and a planner cycle starts for the client

#### Scenario: Staff member spoke to the client
- **WHEN** a staff viewer presses "I answered the client myself", writes "told him we have the 2019 declaration" and confirms
- **THEN** the card shows "answered the client directly" with the note and the viewer's name, the trace shows a `team_question.closed` step with the way "handled outside", and a planner cycle starts for the client

#### Scenario: Blank answer
- **WHEN** the answer box is empty and the send control is pressed
- **THEN** nothing is sent and the control stays disabled

#### Scenario: Already closed
- **WHEN** two people close the same question and the second request arrives after the first was stored
- **THEN** the second request is refused with a message saying the question was already closed, and the card shows the first closing

#### Scenario: Paused client
- **WHEN** a staff member answers a question of a paused client
- **THEN** the answer is stored and shown, no message is scheduled, and the next resume plans with the answer

### Requirement: The planner relays the answer and respects an open question
The planner's input SHALL carry a TEAM QUESTIONS section listing the client's questions, newest first: for each, the question, the reason, the addressee's name, the time asked, and one of: "open"; the answer with the answerer's name and time; or "<name> answered the client directly" with the time and the note when one was written. The agent's instructions SHALL say: a typed answer is office knowledge to be relayed to the client in plain, friendly words in the reply (without naming the colleague unless it helps); after a question answered directly, the office's answer is not repeated and the collection simply continues; an open question must not be asked again and the agent must not answer that one topic itself; an open question blocks nothing else, so documents, clarifications and reminders about the other items go on as usual; a client who asks about the open topic again is told the office is still checking; a client whose words show the office already settled the topic (a document for it, "I spoke with the office", "as agreed with Dana") is not told "still checking" and the collection continues. The planner SHALL be run once after a question is closed; after a typed answer the reply of that cycle SHALL relay it. When the 24-hour WhatsApp window is closed at that time, the reply SHALL be an approved template, as any reply outside the window.

#### Scenario: Answer relayed
- **WHEN** the staff member answered "we have the 2019 declaration on file, the client needs to send nothing" and the planner runs
- **THEN** the reply tells the client the office already holds the earlier declaration and nothing more is needed on that point, and the checklist is left as it was

#### Scenario: Handled on the phone
- **WHEN** the staff member closed the question as "answered the client directly" with the note "told him we have the 2019 declaration" and the planner runs
- **THEN** the reply does not repeat that answer and continues with the next missing document

#### Scenario: Client writes while open
- **WHEN** the client writes "did you find out?" while the question is open
- **THEN** the reply says the office is still checking and the planner does not ask the team again

#### Scenario: Client continues after the call
- **WHEN** the question is still open and the client writes "I spoke with Dana, here is the bank confirmation" with a file
- **THEN** the planner ties the file as usual, does not say the office is still checking, and does not ask the team again

#### Scenario: Other items go on
- **WHEN** a question is open and the client sends a pension report
- **THEN** the planner ties the file and asks for the next missing document as it would without the question

#### Scenario: Window closed
- **WHEN** the answer arrives two days after the client's last message
- **THEN** the relaying reply is sent as the approved reopen template

### Requirement: The sidebar shows open questions
In the client list a client with an open question SHALL carry a small question badge on its row, with a hover text saying the agent is waiting for the team's answer. Above the list the sidebar SHALL show a "questions for me" chip with the number of open questions addressed to the signed-in person (under admin view-as, the accountant being viewed), compared by email ignoring letter case; the chip SHALL NOT be shown when that number is zero. Pressing the chip SHALL narrow the list to those clients and SHALL be pressable again to show every client; the search box and the color buttons SHALL apply within the narrowed list. The badge and the chip SHALL count open questions of live clients only and SHALL update when the roster refreshes. The behaviour SHALL be the same in the standalone app and in the monday custom object.

#### Scenario: Viewer with two open questions
- **WHEN** a staff viewer who is the addressee of two open questions opens the workspace
- **THEN** the chip shows 2, both client rows carry the badge, and pressing the chip lists those two clients

#### Scenario: Accountant with none addressed to them
- **WHEN** the accountant opens a workspace where the only open question is addressed to a staff member
- **THEN** the client row carries the badge and no chip is shown for the accountant

#### Scenario: Question answered
- **WHEN** the last open question addressed to the viewer is answered
- **THEN** the badge leaves the row and the chip disappears on the next roster refresh

### Requirement: Questions of a completed or declined client stay readable
When a client's goal completes or the client declines while a question is open, the question SHALL stay open and closable on the questions tab, SHALL still count for the badge and the chip, and the closing SHALL be stored without scheduling any message to the client.

#### Scenario: Declined with an open question
- **WHEN** the client declines the collection while a question is open and the staff member answers afterwards
- **THEN** the answer is stored and shown, and no message is sent to the client
