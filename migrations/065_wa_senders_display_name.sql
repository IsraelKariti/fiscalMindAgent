-- The WhatsApp display name this platform submitted when it bought and
-- registered the sender (openspec `whatsapp-sender`): chosen by the admin in
-- the buy step, default "<accountant name> by FiscalMind". Meta reviews the
-- name after registration and the platform never changes it later, so the
-- stored value is what the admin agent page shows next to the number.
-- NULL = the number was assigned by hand (typed in, or taken from the pool),
-- so the platform did not register it and knows no name for it.
ALTER TABLE wa_senders ADD COLUMN display_name text;
