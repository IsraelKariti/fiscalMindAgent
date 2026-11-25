## ADDED Requirements

### Requirement: Not-required rows are split by their source
The capital-declaration documents card SHALL show "not required" rows in three separate status tabs, by the source of the decision: "לא נדרשים — לפי השאלון" for rows the intake questionnaire settled (the client answered the question or left it empty), "לא נדרשים — לפי השיחה" for rows the client's words in the conversation settled, and "לא נדרשים — סומנו ידנית" for rows the accountant marked by hand (no client words on the row). Each tab SHALL appear only when it has at least one row and SHALL show its count, like the other status tabs. The three tabs SHALL sit after "הוצהרו בצ'אט" and before the retired tabs, in the order questionnaire, conversation, by hand. The badge of the row ("לא נדרש"), its note (the client's quote, the empty-question note, or none) and its actions (return to required, remove) SHALL be unchanged. The progress count SHALL be unchanged: "not required" rows of every source stay outside the goal.

#### Scenario: Settled by a written answer on the questionnaire
- **WHEN** the intake questionnaire check settled "אישור יתרה — קרן השתלמות" as not required from the client's answer "אין לי קרן השתלמות"
- **THEN** the row appears under "לא נדרשים — לפי השאלון" with the badge "לא נדרש" and the quoted answer as its note

#### Scenario: Settled by an empty question on the questionnaire
- **WHEN** the intake questionnaire check settled a row as not required because the client left its question empty
- **THEN** the row appears under "לא נדרשים — לפי השאלון" with the empty-question note

#### Scenario: Settled in the conversation
- **WHEN** the planner settled a row as not required from the client's WhatsApp message "אין לי רכב"
- **THEN** the row appears under "לא נדרשים — לפי השיחה" and its note is the clickable quote that jumps to that message

#### Scenario: Marked by hand
- **WHEN** the accountant chose "mark as not required" on a pending row
- **THEN** the row appears under "לא נדרשים — סומנו ידנית" with no note

#### Scenario: All three on one client
- **WHEN** a client has 9 rows settled by the questionnaire, 1 by the conversation and 1 by hand
- **THEN** the card shows the three tabs with counts 9, 1 and 1, each row sits only in its own tab, and no single "לא נדרשים" tab is shown

#### Scenario: One source only
- **WHEN** every "not required" row of a client came from the questionnaire
- **THEN** only "לא נדרשים — לפי השאלון" is shown, with the count of those rows

### Requirement: A manual not-required mark carries no client quote
When the accountant marks a row "not required" by hand, the system SHALL drop any client quote stored on the row, so the row shows no note and is counted as marked by hand. The dropped quote SHALL remain in the audit trail of the earlier event that stored it.

#### Scenario: Row created by the planner, then marked by hand
- **WHEN** the planner created a pending row from the client's message "יש לי פנסיה במנורה" and the accountant then marks that row not required
- **THEN** the row shows no quote and appears under "לא נדרשים — סומנו ידנית"

#### Scenario: Row seeded by the catalog, then marked by hand
- **WHEN** the accountant marks a catalog-seeded unresolved row not required
- **THEN** the row appears under "לא נדרשים — סומנו ידנית" with no note
