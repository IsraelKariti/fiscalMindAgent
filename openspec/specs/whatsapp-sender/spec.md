# whatsapp-sender Specification

## Purpose

Registration and assignment of WhatsApp sender numbers on Twilio for agent instances: the profile (display name, logo) and inbound webhook every sender the platform uses must carry, so clients see a branded, reachable agent.

## Requirements

### Requirement: Auto-provisioned senders carry the platform profile
When the platform buys a number and registers it as a WhatsApp sender, the registration SHALL include a profile with the configured display name and the configured logo URL. The logo URL SHALL default to the dashboard's public logo (`<APP_BASE_URL>/logo.png`) when no explicit logo URL is configured.

#### Scenario: Buy number with a public logo URL
- **WHEN** an admin buys a number for an agent instance and the logo URL is an `https` URL
- **THEN** the sender is registered with both the display name and that logo URL in its profile

#### Scenario: Buy number when the logo URL is not public
- **WHEN** an admin buys a number and the logo URL is not an `https` URL (for example the local `http://localhost:3000/logo.png` default)
- **THEN** the sender is registered with the display name only, a log line states that the logo was skipped, and provisioning completes normally

### Requirement: Assigning a number applies the logo to its sender
When an admin assigns (or re-assigns) a number to an agent instance, the system SHALL set the sender's profile logo to the configured logo URL if the sender has no logo or a different one, in the same step that claims the inbound webhook. The sender's display name SHALL NOT be changed by assignment.

#### Scenario: Re-assign a sender registered without a logo
- **WHEN** an admin assigns a number whose Twilio sender has no profile logo and the logo URL is `https`
- **THEN** the sender's profile is updated with the logo URL, the display name stays as it was, and the assignment is recorded

#### Scenario: Sender already has the logo
- **WHEN** an admin assigns a number whose sender profile already carries the configured logo URL
- **THEN** no profile update is sent to Twilio and the assignment proceeds

#### Scenario: Logo URL is not public on assignment
- **WHEN** an admin assigns a number and the logo URL is not an `https` URL
- **THEN** the logo step is skipped with a log line and the webhook claim and assignment proceed as before

### Requirement: Logo update failures do not block assignment
A failure to update the sender's logo SHALL be logged and SHALL NOT fail the assignment, while a failure to claim the inbound webhook SHALL still fail the assignment as it does today.

#### Scenario: Twilio rejects the logo update
- **WHEN** Twilio returns an error for the profile update during assignment
- **THEN** the error is logged, the webhook claim result decides the outcome, and a successful webhook claim leads to a recorded assignment

### Requirement: Purchased numbers come from the configured country
When the platform buys a number for an agent instance, it SHALL buy a number from the configured purchase country. The purchase country SHALL default to Israel (`IL`) and SHALL be configurable per environment with an ISO 3166-1 alpha-2 country code. The purchased number MUST be SMS-capable so Meta can verify it as a WhatsApp sender. When the country offers several number types, the platform SHALL prefer a mobile number and fall back to a local (landline) number when no mobile number is for sale.

#### Scenario: Default purchase buys an Israeli number
- **WHEN** an admin buys a number for an agent instance and no purchase country is configured
- **THEN** the platform buys an Israeli (`+972`) SMS-capable number, registers it as a WhatsApp sender and assigns it to the instance, exactly as it did for US numbers before

#### Scenario: Purchase country configured
- **WHEN** the purchase country is configured as `US`
- **THEN** the platform buys a US number instead, with the same registration and assignment

#### Scenario: No mobile number for sale
- **WHEN** Twilio offers no mobile number in the purchase country but offers a local one
- **THEN** the platform buys the local SMS-capable number

#### Scenario: Nothing for sale in the country
- **WHEN** Twilio offers neither a mobile nor a local SMS-capable number in the purchase country
- **THEN** the purchase fails with an error that names that country, no number is bought, and the instance keeps no sender

#### Scenario: Invalid country code
- **WHEN** the configured purchase country is not a two-letter code
- **THEN** the application refuses to start with a configuration error naming the setting
