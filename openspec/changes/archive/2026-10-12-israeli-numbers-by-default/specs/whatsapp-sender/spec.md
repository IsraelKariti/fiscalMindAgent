## ADDED Requirements

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
