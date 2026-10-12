## ADDED Requirements

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
