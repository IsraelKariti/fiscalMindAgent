# document-fetch Specification

## Purpose

Governs when the agent may offer to fetch a client's documents from an external site (tax authority, Altshuler Shaham, Harel) on the client's behalf, and where the platform takes the client's login identity from for that fetch.

## Requirements

### Requirement: Fetch login identity falls back to the id stored on the client
For providers whose login needs only the client's national id and phone (Altshuler Shaham, Harel), the platform SHALL resolve the national id in this order: the provider's own portal-credentials row, then the tax-authority portal-credentials row, then the id stored on the client at enrollment (`agent_fields.id_number`). The phone SHALL be the client's WhatsApp number. The same resolution SHALL be used both when deciding whether the fetch is available to offer and when the worker performs the login, so an offer the agent makes can always be carried out. The Israel Tax Authority provider is unchanged: its login also needs a user code, which exists only in a portal-credentials row.

#### Scenario: Capital-declaration client with an id from the CRM card is offered the fetch
- **WHEN** a client has no portal-credentials row, has `agent_fields.id_number` and a WhatsApp number, WhatsApp is allowed, and a pending required document names Altshuler (or Harel)
- **THEN** the Altshuler (or Harel) fetch is available, its block appears in the agent's prompt, and the agent may offer the fetch instead of asking for an upload

#### Scenario: Worker login uses the stored id
- **WHEN** the client agrees and the worker starts the login for such a client
- **THEN** the login is attempted with the stored id and the client's WhatsApp number, and the session does not fail with "no portal credentials on file"

#### Scenario: Credentials row wins over the stored id
- **WHEN** a client has both a portal-credentials row with an id and `agent_fields.id_number`
- **THEN** the id from the portal-credentials row is used

#### Scenario: No id anywhere keeps the fetch unavailable
- **WHEN** a client has no portal-credentials row and no `agent_fields.id_number`, or has no WhatsApp number
- **THEN** the provider is not available, no fetch block is added to the prompt, and the agent asks for the document as before

#### Scenario: Tax authority still needs a credentials row
- **WHEN** a client has `agent_fields.id_number` but no tax-authority portal-credentials row
- **THEN** the tax-authority fetch remains unavailable
