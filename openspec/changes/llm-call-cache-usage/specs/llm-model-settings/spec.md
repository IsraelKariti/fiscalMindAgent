## ADDED Requirements

### Requirement: Admin chooses the Anthropic cache lifetime
The admin settings "language model" section SHALL show one "Anthropic cache lifetime" picker with exactly two options, "5 minutes" and "1 hour", and a short line under it stating the trade-off: writing the cache costs 1.25 times the input price for 5 minutes and 2 times for 1 hour, and reading it costs about a tenth. The setting SHALL be one platform-wide value that applies to every stage, every accountant and every client. With nothing saved, the value SHALL be "5 minutes". A change SHALL take effect from the next Anthropic call without a restart. The server SHALL refuse any other value. Only admins SHALL read or change it. The picker SHALL be shown only when the deployment can call Anthropic (its API key is set).

#### Scenario: Default
- **WHEN** no lifetime was ever saved and an Anthropic call runs
- **THEN** the call asks for a 5-minute cache and the picker shows "5 minutes"

#### Scenario: Admin switches to 1 hour
- **WHEN** an admin picks "1 hour" and saves
- **THEN** the next Anthropic call asks for a 1-hour cache and its call row records "1 hour", with no restart

#### Scenario: Invalid value refused
- **WHEN** a save request carries a lifetime other than the two options
- **THEN** the server refuses it and the saved value does not change

#### Scenario: No Anthropic key
- **WHEN** the deployment has no Anthropic API key
- **THEN** the picker is not shown
