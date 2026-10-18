## ADDED Requirements

### Requirement: A vehicle licence is helpful, not required
The vehicle licence SHALL be a helpful paper, not a required one, and the vehicle type SHALL run no validity check: a vehicle licence SHALL be accepted whatever its "valid until" date — valid today, expired after 31.12 of the tax year, or expired years before it — and the verification date SHALL play no part. The "valid until" date SHALL still be read into `valid_until` for the record. The type's description, its analysis hint, its extraction prompt, the planner's vehicle instructions and the questionnaire intake rule SHALL NOT state any validity condition on the licence and SHALL NOT call the licence or the purchase document mandatory; the licence item SHALL be named "העתק רישיון רכב — [the vehicle]" without "בתוקף". A client who sends an expired licence SHALL NOT be asked for a newer one. What the agent does when the client cannot send the licence or the purchase document is the `vehicle-declaration` capability.

#### Scenario: Licence expired long before the valuation date
- **WHEN** a client of the 2025 declaration sends a vehicle licence that reads "valid until" 22.04.2022
- **THEN** the file passes verification, is tied to the licence item, the `verify_extraction` row carries no `not_expired` check, and the agent does not ask for a licence that was valid on 31.12.2025

#### Scenario: Licence expired between the valuation date and the verification
- **WHEN** a client of the 2025 declaration sends, in May 2026, a vehicle licence that reads "valid until" 20.03.2026
- **THEN** the file passes verification and is tied to the licence item, and the agent does not ask for a renewed licence

#### Scenario: Agent wording about the licence
- **WHEN** the agent asks the client for a vehicle licence
- **THEN** it presents the licence as helpful, does not call it mandatory, and does not state any validity condition on it

## REMOVED Requirements

### Requirement: A vehicle licence is judged at the valuation date
**Reason**: The accountant corrected the office rule on 2026-10-18 — the vehicle declaration rests on the client's statement; the licence is a nice-to-have, and an expired licence (even one that expired years before the declaration date) is acceptable. The validity check and its wording are withdrawn.
**Migration**: The `not_expired` check is removed from the vehicle type; no stored data changes. A licence file that failed `not_expired` before this change passes when verified again. The behaviour is now covered by "A vehicle licence is helpful, not required" and by the `vehicle-declaration` capability.
