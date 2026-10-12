## ADDED Requirements

### Requirement: A vehicle licence is judged at the valuation date
The vehicle type SHALL accept a licence that was valid on 31.12 of the tax year: a licence whose "valid until" date is on or after that date SHALL be accepted even when it has expired by the time the file is verified, and a licence whose "valid until" date is before that date SHALL be rejected. The verification date SHALL NOT affect the judgment. The type's description, its analysis hint and its extraction prompt SHALL state this rule in place of the rule that an expired licence is never acceptable, and the planner's vehicle instructions SHALL tell the client that the licence must have been valid on 31.12 of the tax year and ask for a renewed licence only when the one sent expired before that date. The "valid until" date SHALL still be read into `valid_until` as today, and a licence with no readable "valid until" date SHALL still skip the check.

#### Scenario: Licence expired between the valuation date and the verification
- **WHEN** a client of the 2025 declaration sends, in May 2026, a vehicle licence that reads "valid until" 20.03.2026
- **THEN** the file passes verification and is tied to the licence item, and the agent does not ask for a renewed licence

#### Scenario: Licence expired before the valuation date
- **WHEN** a client of the 2025 declaration sends a vehicle licence that reads "valid until" 20.07.2025
- **THEN** the file fails verification with a note that the licence expired before 31.12.2025, and the agent asks for the licence that was valid on that date

#### Scenario: Agent wording about the licence
- **WHEN** the agent asks the client for a vehicle licence
- **THEN** it says the licence must have been valid on 31.12 of the tax year and does not say that an expired licence is never acceptable
