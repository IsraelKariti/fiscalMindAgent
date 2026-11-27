# whatsapp-sender Specification

## Purpose

Registration and assignment of WhatsApp sender numbers on Twilio for agent instances: the profile (display name, logo) and inbound webhook every sender the platform uses must carry, so clients see a branded, reachable agent.

## Requirements

### Requirement: Auto-provisioned senders carry the platform profile
When the platform buys a number and registers it as a WhatsApp sender for an agent instance, the registration SHALL include a profile with the configured display name and the instance's effective picture URL (its own icon, else the admin-uploaded app logo, else the built-in default picture).

#### Scenario: Buy number for an instance with its own icon
- **WHEN** an admin buys a number for an agent instance that has an uploaded icon and the picture URL is an `https` URL
- **THEN** the sender is registered with the display name and that instance's icon URL in its profile

#### Scenario: Buy number with a public logo URL
- **WHEN** an admin buys a number for an agent instance without its own icon and the effective picture URL is an `https` URL
- **THEN** the sender is registered with the display name and the app logo URL (or the built-in default URL when no app logo is uploaded) in its profile

#### Scenario: Buy number when the logo URL is not public
- **WHEN** an admin buys a number and the effective picture URL is not an `https` URL (for example a local `http://localhost:3000/...` base)
- **THEN** the sender is registered with the display name only, a log line states that the picture was skipped, and provisioning completes normally

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

#### Scenario: Admin edits the name before buying
- **WHEN** the admin changes the field to "אריה רותם ושות' מבית FiscalMind" and confirms
- **THEN** the sender is registered with exactly that name (trimmed), not the default

#### Scenario: Name too short
- **WHEN** the admin confirms with a name of two characters
- **THEN** the request is refused with an error naming the display name, and no number is bought

### Requirement: Assigning a number applies the logo to its sender
When an admin assigns (or re-assigns) a number to an agent instance, the system SHALL set the sender's profile logo to that instance's effective picture URL if the sender has no logo or a different one, in the same step that claims the inbound webhook. The sender's display name SHALL NOT be changed by assignment.

#### Scenario: Re-assign a sender registered without a logo
- **WHEN** an admin assigns a number whose Twilio sender has no profile logo and the effective picture URL is `https`
- **THEN** the sender's profile is updated with that URL, the display name stays as it was, and the assignment is recorded

#### Scenario: Assign to an instance with its own icon
- **WHEN** an admin assigns a number carrying the app logo to an instance that has its own uploaded icon
- **THEN** the sender's profile logo is updated to the instance's icon URL

#### Scenario: Sender already has the logo
- **WHEN** an admin assigns a number whose sender profile already carries the instance's effective picture URL
- **THEN** no profile update is sent to Twilio and the assignment proceeds

#### Scenario: Logo URL is not public on assignment
- **WHEN** an admin assigns a number and the effective picture URL is not an `https` URL
- **THEN** the picture step is skipped with a log line and the webhook claim and assignment proceed as before

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

### Requirement: A picture change reaches the affected senders
When an admin uploads or removes an agent's icon, the system SHALL update that agent's sender profile logo to the new effective picture URL in the same request, when the agent has a number registered on Twilio. When an admin uploads or removes the app logo, the system SHALL update the sender of every agent instance that has a number and no own icon. Updates SHALL touch only the profile logo, never the webhook or display name. A failing Twilio update SHALL be logged and reported in the response and SHALL NOT undo the picture change.

#### Scenario: Agent icon upload for an instance with a number
- **WHEN** an admin uploads an icon for an instance whose number is registered on Twilio and the icon URL is `https`
- **THEN** the sender's profile logo is set to the new icon URL and the response says the WhatsApp profile was updated

#### Scenario: Agent icon removal for an instance with a number
- **WHEN** an admin removes the icon of an instance whose number is registered on Twilio
- **THEN** the sender's profile logo is set to the app logo URL, or to the built-in default URL when no app logo is uploaded

#### Scenario: App logo change
- **WHEN** an admin uploads or removes the app logo while two agents have numbers, one with its own icon and one without
- **THEN** only the sender of the agent without an own icon is updated, and the response lists how many senders were updated and how many failed

#### Scenario: Instance without a number
- **WHEN** an admin uploads or removes an icon for an instance that has no WhatsApp number
- **THEN** only the stored icon changes and no Twilio call is made

#### Scenario: Twilio rejects an update
- **WHEN** Twilio returns an error for a profile update after an upload
- **THEN** the picture stays saved, the error is logged, and the response tells the admin the picture is saved but that sender's WhatsApp profile was not updated

### Requirement: Twilio number name records the owning agent
A number the platform owns on Twilio SHALL carry, in its Twilio friendly name, the agent instance that currently uses it: the platform SHALL set the name to `fiscalmind <agent instance id> <agent type>`, cut to Twilio's 64-character name limit so that the id is always complete, when it buys the number for an instance and when an admin assigns the number to an instance, and SHALL set it to `fiscalmind pool` when the number is unassigned (explicitly, or because the accountant account was deleted). A name written in the earlier order (`fiscalmind <agent type> <id>`), whose id Twilio cut short, SHALL still be read as recording that instance. The rename on assignment SHALL be best-effort: a rename failure is logged and does not undo or fail the assignment. A number the account does not own (an externally registered number entered by hand) is never renamed.

#### Scenario: Assign a pool number
- **WHEN** an admin assigns an owned number named `fiscalmind pool` to an agent instance
- **THEN** after the assignment the number's Twilio friendly name is `fiscalmind <instance id> <agent type>` of that instance, cut to 64 characters

#### Scenario: Re-assign within the same environment
- **WHEN** an admin assigns a number that another agent instance of this environment used until now
- **THEN** the assignment follows the existing rules and the name is updated to the new instance's label

#### Scenario: Rename fails
- **WHEN** Twilio rejects the rename after the assignment
- **THEN** the assignment is kept, the failure is logged, and the response reports the assignment as successful

#### Scenario: Externally registered number
- **WHEN** an admin assigns a number the Twilio account does not own
- **THEN** no rename is attempted and the assignment follows the existing rules

### Requirement: Numbers owned by another environment are not offered
When a number owned on Twilio is not assigned in this environment but its friendly name records an agent instance id that does not exist in this environment's database, the number SHALL be treated as in use by another environment: the pool / orphaned-numbers list SHALL report it with that flag, the admin UI SHALL show it greyed out with the note "in use in another environment" and without a choose or release button, and the platform SHALL refuse to assign it to an agent instance or to release it, returning a conflict error that says the number is in use in another environment. A number whose name records an instance id that exists in this environment, or whose name follows no ownership convention, SHALL be offered as free, as today.

#### Scenario: Production number seen from local development
- **WHEN** an admin in local development opens the pool and a number is named `fiscalmind <id> declaration_of_capital` (or in the earlier order with the id cut short) where `<id>` is not an agent instance in the local database
- **THEN** the number is listed greyed out with the note "in use in another environment" and cannot be chosen

#### Scenario: Manual assignment of a number owned elsewhere
- **WHEN** an admin types that number into the manual assignment form
- **THEN** the assignment is refused with a conflict error that names the cause, and the number's webhook and name are not changed

#### Scenario: Release of a number owned elsewhere
- **WHEN** an admin asks to release that number from the orphaned-numbers section
- **THEN** the release is refused with a conflict error and the number stays on the account

#### Scenario: Stale label from this environment
- **WHEN** an owned, unassigned number is named with an instance id that exists in this environment's database
- **THEN** the number is offered as free and may be chosen or released

#### Scenario: Number without an ownership label
- **WHEN** an owned, unassigned number's friendly name is its phone number or any text outside the `fiscalmind …` convention
- **THEN** the number is offered as free, as today
