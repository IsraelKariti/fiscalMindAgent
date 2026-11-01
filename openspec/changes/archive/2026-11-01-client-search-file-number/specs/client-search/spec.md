## Purpose
What the search box above the accountant's client list matches, how the typed text is compared, and how the office file number is shown in the list.

## ADDED Requirements

### Requirement: The client search matches name, contact and file number
The search box above the client list SHALL show the clients whose name, email address, WhatsApp number or office file number contains the typed text. Name and email SHALL be compared case-insensitively, as today. The file number comparison SHALL ignore spaces and dashes on both sides, so "12-345" finds the file number "12345" and "12345" finds "12-345". An empty box SHALL show every client. A client with no stored file number SHALL only be found by name or contact.

#### Scenario: Search by file number
- **WHEN** the accountant types "4471" and one client's file number is "2024-4471"
- **THEN** that client is listed, and a client whose name or contact does not contain "4471" and whose file number is "9001" is not

#### Scenario: Dashes ignored
- **WHEN** the accountant types "2024-44" and a client's file number is "202444"
- **THEN** that client is listed

#### Scenario: Name still matches
- **WHEN** the accountant types "ישראל"
- **THEN** every client whose name contains "ישראל" is listed, as before

#### Scenario: No file number stored
- **WHEN** a client has no file number and the accountant types digits that appear in no name or contact
- **THEN** that client is not listed

### Requirement: The file number shows in the client row
A client row in the list SHALL show the client's office file number, labelled as a file number, next to the contact line, when the client has one. A client without a file number SHALL show the row as today. The search placeholder SHALL name the three things it searches: name, email and file number.

#### Scenario: Row with a file number
- **WHEN** a client's file number is "2024-4471"
- **THEN** its row shows "תיק 2024-4471" beside the phone or email

#### Scenario: Row without a file number
- **WHEN** a client has no file number
- **THEN** its row shows only the name and the contact line
