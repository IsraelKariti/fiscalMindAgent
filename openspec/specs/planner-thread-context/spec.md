# planner-thread-context Specification

## Purpose

Defines what the planner LLM is told about the agent's own messages when it decides the next action: delivered messages appear in the message thread, and drafts that were never delivered appear in a separate, clearly labelled block.

## Requirements

### Requirement: Planner sees its own unsent drafts in a separate block
When the planner prompt is built, the system SHALL include a block listing the agent's unsent outbound drafts for that client — drafts that were replaced by a newer plan before sending, and drafts held for admin review. Each entry SHALL show the draft's creation time, its channel, and its body. The block SHALL be separate from the message thread, and the message thread SHALL keep containing only delivered messages (sent outbound and received inbound).

#### Scenario: Burst of client messages
- **WHEN** a client sends three messages in a row, and each of the first two replaced the agent's scheduled reply before it was sent
- **THEN** the prompt for the third message lists the two replaced drafts in the unsent-drafts block, in chronological order, and the message thread shows the three client messages with no agent reply between them

#### Scenario: Draft held for review
- **WHEN** the agent's latest draft is held awaiting admin review and a new client message triggers a plan
- **THEN** the held draft appears in the unsent-drafts block

#### Scenario: No unsent drafts
- **WHEN** the client has no unsent outbound drafts in scope
- **THEN** the prompt contains no unsent-drafts block at all

### Requirement: Unsent drafts are labelled as never delivered
The unsent-drafts block SHALL state that its entries were never delivered and that the client has not read them. The planner's instructions SHALL tell the model to use the block only to know what it already drafted, and never to treat a draft as something the client saw, agreed to, or answered.

#### Scenario: Draft contained an offer the client never saw
- **WHEN** an unsent draft offered to fetch a document and the client's next message says nothing about it
- **THEN** the prompt presents that offer as undelivered, and the delivered thread contains no such offer

### Requirement: Unsent drafts never count as delivered messages in code rules
Code rules that depend on what was delivered — the attestation request and its confirmation window, evidence quotes from client messages, the WhatsApp 24h window, and tax-fetch readiness — SHALL ignore unsent drafts.

#### Scenario: Attestation request only in an unsent draft
- **WHEN** an attestation request exists only in an unsent draft and the client then writes "confirmed"
- **THEN** the attestation is not treated as requested and the message is not accepted as its confirmation

### Requirement: The unsent-drafts block is bounded
The block SHALL include only drafts created after the most recent delivered outbound message (all unsent drafts when no outbound message was ever delivered), SHALL include at most the 5 most recent of those, and SHALL cap the length of each draft body, marking a cut body as truncated.

#### Scenario: Old drafts before the last delivered reply
- **WHEN** the client has unsent drafts from before the agent's last delivered message and one unsent draft after it
- **THEN** only the later draft appears in the block

#### Scenario: More than five unsent drafts
- **WHEN** eight unsent drafts were created after the last delivered outbound message
- **THEN** the block lists the five most recent, in chronological order
