## MODIFIED Requirements

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

## ADDED Requirements

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
