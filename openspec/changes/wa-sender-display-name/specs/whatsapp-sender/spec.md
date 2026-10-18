## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: The submitted display name is recorded and shown
The platform SHALL store the display name it submitted with each auto-provisioned sender and SHALL show it on the admin agent page next to the assigned number. A sender assigned by hand (number typed in, or taken from the pool) SHALL show no stored name, since the platform did not register it.

#### Scenario: Agent page after a purchase
- **WHEN** an admin bought a number with the name "אריה רותם ושות' by FiscalMind"
- **THEN** the agent page shows that name next to the number, labelled as the WhatsApp display name

#### Scenario: Agent page for a hand-assigned number
- **WHEN** the agent's number was assigned without a purchase
- **THEN** the agent page shows the number with no display name line
