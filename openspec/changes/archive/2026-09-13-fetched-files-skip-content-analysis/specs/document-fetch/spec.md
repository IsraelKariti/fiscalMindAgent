## ADDED Requirements

### Requirement: Fetched files are exempt from content analysis
A file the platform fetches from an external site on the client's behalf SHALL be stored with the analysis status "not needed" from the moment it is saved. It SHALL never be visible with the status "pending". Such a file SHALL NOT be quarantined and SHALL NOT count as client-supplied evidence for any planner-proposed state change. The agent's transcript view of the file SHALL state that content analysis does not apply because the platform fetched the file itself and linked it to its document.

#### Scenario: Delivery of a fetched document
- **WHEN** a fetch session delivers one or more documents for a client
- **THEN** every saved file carries analysis status "not needed" and is linked to its target document as today

#### Scenario: Agent reads a fetched file
- **WHEN** the agent prompt lists a file with status "not needed"
- **THEN** the file's analysis line says content analysis is not applicable because the platform fetched the file and linked it, not that analysis is unavailable or pending

#### Scenario: Existing fetched files
- **WHEN** the backfill migration runs against a database holding fetched files still marked "pending"
- **THEN** those files are updated to "not needed" and files from other sources are left unchanged
