-- Per-agent-instance sender addresses: each email-sending agent instance gets
-- <accountant-prefix>-<agent-suffix>@fiscalmind.app (e.g. cohen-document@...),
-- so clients see distinct senders per agent and inbound routing can identify
-- the instance from the To-address alone (like wa_senders does for WhatsApp
-- numbers). Rows with agent_instance_id IS NULL are the accountant's original
-- account mailbox (the claimed prefix); rows with an instance id are derived
-- instance addresses. Both kinds live in one table so local_part/email_address
-- UNIQUE form a single namespace: a derived address can never collide with
-- another user's claimed prefix (prefix "cohen" + debt agent vs. a user who
-- claimed "cohen-debt") — the constraint, not string parsing, is the arbiter.

ALTER TABLE agent_mailboxes
  ADD COLUMN agent_instance_id UUID REFERENCES agent_instances(id) ON DELETE CASCADE;

-- One account row per user (was: user_id UNIQUE); at most one address per instance.
ALTER TABLE agent_mailboxes DROP CONSTRAINT agent_mailboxes_user_id_key;
CREATE UNIQUE INDEX agent_mailboxes_account_row_key
  ON agent_mailboxes (user_id) WHERE agent_instance_id IS NULL;
ALTER TABLE agent_mailboxes
  ADD CONSTRAINT agent_mailboxes_agent_instance_id_key UNIQUE (agent_instance_id);

-- Derived local parts are <prefix>-<suffix>; user-chosen prefixes stay <=30
-- chars via the API regex (src/api/mailbox.ts), so widen only the DB cap to
-- make room for the suffix.
ALTER TABLE agent_mailboxes DROP CONSTRAINT agent_mailboxes_local_part_check;
ALTER TABLE agent_mailboxes
  ADD CONSTRAINT agent_mailboxes_local_part_check
  CHECK (local_part ~ '^[a-z0-9]([a-z0-9-]{1,38}[a-z0-9])?$');
