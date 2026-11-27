## MODIFIED Requirements

### Requirement: The planner may ask the team one question
In a planner run the planner SHALL be able to ask the client's team one question, giving the question text and a short reason, before the run's message. The run SHALL still end with its one WhatsApp message to the client, which tells the client that the office is being consulted and will come back to them; that message's send time SHALL be "as soon as possible". The system SHALL refuse an `ask_team` call, answering the call with the reason, when a question for that client is still open, when the run already asked once, when the question is empty, or when the run already scheduled its message or ended on `goal_complete` or `client_declined`; the run goes on after a refusal. A question SHALL be asked only for something the client raised that the agent cannot settle from its instructions and the client's file: the office's practice, an unusual document, a tax or accounting judgement. A clarification question about a checklist item, a question answered in the agent's own knowledge base, and small talk SHALL NOT be sent to the team. An accepted ask SHALL be recorded on the client's trace as an `ask_team` step with the question, the reason, the addressee and the question's id.

#### Scenario: Client asks about the office's practice
- **WHEN** the client writes that his previous capital declaration was prepared by another office and asks whether the office needs it, and the agent's instructions do not settle it
- **THEN** the run asks the team that question with the client's words as the reason, the call's result names the addressee, and the run ends with a short message saying it will check with the office and come back; the trace shows the `ask_team` step before the message step

#### Scenario: Question already open
- **WHEN** a question for the client is still unanswered and the model calls `ask_team` again
- **THEN** the call is refused with a result naming the open question, and the model's message tells the client the office is still checking without asking again

#### Scenario: Ask without a message
- **WHEN** the model calls `ask_team` and then ends the run on `goal_complete`, or calls `ask_team` in the same turn after an accepted `send_whatsapp_text`
- **THEN** the `goal_complete` is refused while a question was just asked (the client must be told), and the late `ask_team` is refused because the run already ended

#### Scenario: Answered in the knowledge base
- **WHEN** the client asks why a bank balance must be as of 31 December
- **THEN** the planner answers from its instructions and asks the team nothing
