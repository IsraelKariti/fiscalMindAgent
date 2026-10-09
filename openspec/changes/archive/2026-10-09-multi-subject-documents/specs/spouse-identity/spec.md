## MODIFIED Requirements

### Requirement: Verification accepts the client or the spouse and rejects anyone else
The identity check SHALL be judged over the document's owner parties (the `document-extraction` capability): the people the extraction lists with role `owner`. Parties with any other role SHALL NOT take part in the identity check. Each owner party SHALL be resolved on its own, against the client and the one spouse on file, as one of: the client, the spouse, an adoptable stranger, or nobody. For an owner party that prints an id: it is the client when the id equals the client's id on file; it is the spouse when the id equals the spouse's id on file; otherwise, when the client's id is on file, it is an adoptable stranger only if all of the following hold: no spouse id is on file yet, the printed id passes the Israeli id checksum, the marital status on file is not "not married", and — when a spouse name is on file — the party's own printed name loosely matches that spouse name; otherwise it is nobody. For an owner party that prints no id, the party's name decides, as the name-only requirement states. When no client id is on file, a party whose id equals the spouse's id on file is the spouse; any other party with an id is reported, not compared, and is never an adoptable stranger.

The document SHALL pass the identity check when at least one owner party is the client or the spouse, or is adopted as the spouse in this verification. The other owner parties are co-owners: they SHALL be listed in the verification's trace with their masked ids and SHALL NOT fail the document. The check SHALL fail when the document lists owner parties and none of them is the client, the spouse, or an adopted spouse; the failure note SHALL say, for the owners that printed an id, which condition stopped them: the document belongs to a third person (a spouse is already on file), the client is registered as not married, or the printed name does not match the spouse on file. The check SHALL also fail when the document lists no owner party and the type requires a subject.

A spouse SHALL be adopted in this verification only when exactly one owner party is an adoptable stranger and one of the following holds: the document lists exactly one owner party; or a spouse name is on file and that party's printed name loosely matches it. When the document lists several owner parties and no spouse name is on file, no spouse SHALL be adopted, and the adoptable stranger is reported as a co-owner. When the spouse is adopted, the party's own printed id and — when no spouse name is on file — the party's own printed name SHALL be stored on the client before the next document is verified; the stored name SHALL be the name of that one party and never the names of several parties joined together. The adoption SHALL be audited and reported as today.

#### Scenario: Spouse pension with the spouse's id from the questionnaire
- **WHEN** the spouse's id ••••••782 is on file from the questionnaire and a pension report listing one owner "מיכל תמיר" with id 123456782 is verified for client "ניב"
- **THEN** the identity check passes with expected "spouse ••••••782 (questionnaire)", the subject check passes, and the document is approved when its other checks pass

#### Scenario: First foreign id becomes the spouse
- **WHEN** the client's id is on file, no spouse id is on file, the marital status is married or unknown, and a document listing one owner "מיכל תמיר" with a checksum-valid id that is not the client's is verified
- **THEN** the identity check passes, the extra "spouse adopted" check is reported with the masked id, the client record now holds spouse "מיכל תמיר" with that id from the document, and an audit event records the adoption

#### Scenario: Second document of the same spouse in the same batch
- **WHEN** two of the spouse's documents are collected in one turn and the first one infers the spouse
- **THEN** the second one is verified against the spouse just stored and passes the identity check without a second adoption

#### Scenario: A third person's document
- **WHEN** the client's id and a spouse id are on file and a document lists one owner with a checksum-valid id that equals neither
- **THEN** the identity check fails with a note that the document belongs to neither the client nor the spouse on file, the verification result is a failure, and the record is unchanged

#### Scenario: Printed id fails the checksum
- **WHEN** no spouse id is on file and a document lists one owner with an id that is not the client's and fails the checksum
- **THEN** the id checksum check fails as today and no spouse is inferred

#### Scenario: Four-party contract with no spouse name on file
- **WHEN** the client "ניב" (id on file) is married with no spouse on file, and a purchase contract is verified whose owners are "תמיר ניב" with the client's id and "תמיר מיכל" with a checksum-valid other id, and whose counterparties are two sellers with their ids
- **THEN** the identity check passes as the client, "תמיר מיכל" is listed as a co-owner, no spouse is adopted, the sellers take no part in the check, and the client record is unchanged

#### Scenario: Four-party contract with the spouse's name from the questionnaire
- **WHEN** the questionnaire named the spouse "מיכל תמיר" with no id, and the same contract is verified
- **THEN** the identity check passes for both the client and the spouse, the spouse's id is adopted from the party "תמיר מיכל" only, the stored spouse name stays "מיכל תמיר", and the sellers' ids are never stored

#### Scenario: Joint account with a co-owner who is not the spouse
- **WHEN** the client's id and the spouse's id are on file, and a bank certificate is verified whose owners are the client with his id and "דנה לוי" with a checksum-valid third id
- **THEN** the identity check passes as the client, "דנה לוי" is listed as a co-owner, and the document is not rejected as a third person's

#### Scenario: Only strangers own the document
- **WHEN** the client's id and the spouse's id are on file, and a document is verified whose only owners are two people with checksum-valid ids that equal neither
- **THEN** the identity check fails with a note that the document belongs to a third person, the verification result is a failure, and the record is unchanged

#### Scenario: Two adoptable strangers, no spouse name on file
- **WHEN** the client's id is on file, no spouse is on file, and a document is verified whose owners are the client and two other people with checksum-valid ids
- **THEN** the identity check passes as the client, both are listed as co-owners, and no spouse is adopted

#### Scenario: A seller's id is the only id printed
- **WHEN** a purchase contract is verified whose owners "תמיר ניב" and "תמיר מיכל" print no id and whose counterparty prints an id
- **THEN** the owners are judged by name, the identity check passes as the client, the counterparty's id is neither compared nor adopted, and no spouse is adopted

#### Scenario: Client registered as not married
- **WHEN** the questionnaire set the marital status to not married and a document lists one owner with an id that is not the client's
- **THEN** the identity check fails with a note that the client is registered as not married, and no spouse is inferred

#### Scenario: Printed name contradicts the spouse's name from the form
- **WHEN** the questionnaire named the spouse "מיכל תמיר", no spouse id is on file, and a document lists one owner "דנה לוי" with a checksum-valid id that is not the client's
- **THEN** the identity check fails with a note that the printed name does not match the spouse on file, and no spouse is inferred

#### Scenario: Client id not on file
- **WHEN** the client has no id on file, the spouse's id is on file from the questionnaire, and a document lists one owner with that spouse id
- **THEN** the identity check passes as the spouse, and the "no client id on file" report is absent

### Requirement: A name-only document may be the spouse's
For an owner party that prints no id, the party SHALL count as the client when its printed name loosely matches the client's name, as the spouse when it loosely matches the spouse's name on file, and as nobody otherwise. The subject check SHALL pass when at least one owner party counts as the client or the spouse, by id or by name. A spouse SHALL NOT be inferred from a name alone.

#### Scenario: Spouse's name on file, no id printed
- **WHEN** the spouse "מיכל תמיר" is on file and a bank confirmation listing one owner "מיכל תמיר" with no id is verified for client "ניב"
- **THEN** the subject check passes with expected the spouse's name

#### Scenario: Unknown name, no id printed
- **WHEN** no spouse is on file and a document listing one owner "דנה לוי" with no id is verified for client "ניב"
- **THEN** the subject check fails as today and no spouse is recorded

#### Scenario: Joint owners, no ids printed
- **WHEN** no spouse is on file and a document listing the owners "תמיר ניב" and "דנה לוי", neither with an id, is verified for client "ניב"
- **THEN** the subject check passes as the client, "דנה לוי" is listed as a co-owner, and no spouse is recorded
