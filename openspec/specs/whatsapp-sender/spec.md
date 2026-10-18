# whatsapp-sender Specification

## Purpose

Registration and assignment of WhatsApp sender numbers on Twilio for agent instances: the profile (display name, logo) and inbound webhook every sender the platform uses must carry, so clients see a branded, reachable agent.

## Requirements

### Requirement: Auto-provisioned senders carry the platform profile
When the platform buys a number and registers it as a WhatsApp sender for an agent instance, the registration SHALL include a profile with a display name the admin chose in the buy step and the instance's effective picture URL (its own icon, else the admin-uploaded app logo, else the built-in default picture).

The buy step SHALL offer the display name prefilled with a default the admin can edit. The default SHALL be `<accountant name> by <platform brand>`, where the accountant name is the admin-entered Hebrew name, else the accountant's account name, and the platform brand is the configured brand name (default `FiscalMind`). When the accountant has no name on file, the default SHALL be the platform brand alone. When the sender registers under the accountant's own connected WhatsApp Business Account, the default SHALL be the accountant name alone.

The platform SHALL reject a display name that, after trimming, is shorter than 3 characters, longer than 100 characters, or spans more than one line, and SHALL buy no number in that case.

#### Scenario: Default name for an accountant with a Hebrew name
- **WHEN** an admin opens the buy step for an agent whose accountant has the Hebrew name "אריה רותם ושות'" and the platform brand is "FiscalMind"
- **THEN** the display name field shows "אריה רותם ושות' by FiscalMind"

#### Scenario: Default name without a Hebrew name
- **WHEN** the accountant has no Hebrew name but the account name "Arie Rotem"
- **THEN** the display name field shows "Arie Rotem by FiscalMind"

#### Scenario: Default name with no accountant name at all
- **WHEN** the accountant has neither a Hebrew name nor an account name
- **THEN** the display name field shows "FiscalMind"

#### Scenario: Default name under the accountant's own WABA
- **WHEN** the accountant has connected their own WhatsApp Business Account and has the Hebrew name "אריה רותם ושות'"
- **THEN** the display name field shows "אריה רותם ושות'"

#### Scenario: Buy number with a public logo URL
- **WHEN** the admin confirms the buy step with the name "אריה רותם ושות' by FiscalMind" and the instance's effective picture URL is an `https` URL
- **THEN** the sender is registered with exactly that name (trimmed) and that picture URL in its profile

#### Scenario: Admin edits the name before buying
- **WHEN** the admin changes the field to "אריה רותם ושות' מבית FiscalMind" and confirms
- **THEN** the sender is registered with exactly that name (trimmed), not the default

#### Scenario: Name too short
- **WHEN** the admin confirms with a name of two characters
- **THEN** the request is refused with an error naming the display name, and no number is bought

#### Scenario: Buy number when the logo URL is not public
- **WHEN** an admin buys a number and the effective picture URL is not an `https` URL (for example a local `http://localhost` address)
- **THEN** the sender is registered with the chosen display name only, a log line states that the picture was skipped, and provisioning completes normally

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

### Requirement: Only purchase and assignment change a sender's inbound webhook
A sender's inbound webhook SHALL be set only when the platform buys and registers the number and when an admin assigns (or re-assigns) the number to an agent instance. Any other update the platform sends to a sender, in particular a picture update after an app logo or agent icon upload or removal, SHALL change only the sender's profile logo and SHALL leave the webhook as it is, even when the webhook points at a different environment.

#### Scenario: Picture update on a sender claimed by another environment
- **WHEN** an admin uploads an app logo or an agent icon while the affected sender's webhook points at another environment's address
- **THEN** the sender's profile logo is updated, the webhook still points at that other address, and the response reports the profile update as successful

#### Scenario: Picture update when the logo already matches
- **WHEN** an admin uploads a picture whose URL the sender's profile already carries
- **THEN** no update is sent to Twilio, and the webhook is untouched

#### Scenario: Assignment still claims the webhook
- **WHEN** an admin assigns a number whose sender webhook points at another environment
- **THEN** the webhook is set to this environment's address in the same step that applies the picture, as before

### Requirement: The submitted display name is recorded and shown
The platform SHALL store the display name it submitted with each auto-provisioned sender and SHALL show it on the admin agent page next to the assigned number. A sender assigned by hand (number typed in, or taken from the pool) SHALL show no stored name, since the platform did not register it.

#### Scenario: Agent page after a purchase
- **WHEN** an admin bought a number with the name "אריה רותם ושות' by FiscalMind"
- **THEN** the agent page shows that name next to the number, labelled as the WhatsApp display name

#### Scenario: Agent page for a hand-assigned number
- **WHEN** the agent's number was assigned without a purchase
- **THEN** the agent page shows the number with no display name line
