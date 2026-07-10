-- Client email addresses are matched case-insensitively (import dedupe,
-- inbound-email routing — which already lowercases the sender). Normalize the
-- stored values and move the per-user uniqueness onto the lowercased address
-- so case variants of the same client can't coexist.
--
-- Fails if a user already has two clients whose emails differ only in case;
-- those rows must be merged by hand first.

DROP INDEX clients_user_id_email_address_key;
UPDATE clients SET email_address = lower(email_address) WHERE email_address <> lower(email_address);
CREATE UNIQUE INDEX clients_user_id_email_address_key ON clients (user_id, lower(email_address));
