-- Multi-agent platform, step 1: agent instances.
--
-- An agent instance is one enabled agent (of a code-defined type, e.g.
-- 'doc_collector') for one accountant. Each instance owns its own client
-- list: clients get agent_instance_id, and per-agent scalar fields live in
-- agent_fields (validated in code by the agent type's Zod schema; relational
-- per-agent data keeps its own tables keyed by client_id, like
-- client_documents). Every existing accountant is backfilled with a
-- doc_collector instance so behavior is unchanged.

CREATE TABLE agent_instances (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- Registry id (src/agents/registry.ts); validated in code, not a DB enum,
  -- so adding an agent type is not a migration.
  agent_type  TEXT NOT NULL,
  name        TEXT NOT NULL,
  enabled     BOOLEAN NOT NULL DEFAULT true,
  settings    JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One instance per type per accountant for now; dropping this is the
  -- extension point for multi-instance (e.g. two doc collectors for two teams).
  UNIQUE (user_id, agent_type)
);

INSERT INTO agent_instances (user_id, agent_type, name)
SELECT id, 'doc_collector', 'איסוף מסמכים' FROM users;

ALTER TABLE clients
  ADD COLUMN agent_instance_id UUID REFERENCES agent_instances(id) ON DELETE CASCADE,
  ADD COLUMN agent_fields JSONB NOT NULL DEFAULT '{}';

-- Legacy CLI-era rows (user_id IS NULL) keep a NULL instance; runtime falls
-- back to the doc_collector definition for them.
UPDATE clients c
SET agent_instance_id = ai.id
FROM agent_instances ai
WHERE ai.user_id = c.user_id;

CREATE INDEX clients_agent_instance_idx ON clients (agent_instance_id);

-- Client identity uniqueness moves from per-accountant to per-instance: the
-- same person may be enrolled with two different agents of one accountant.
DROP INDEX clients_user_id_email_address_key;
CREATE UNIQUE INDEX clients_instance_email_address_key
  ON clients (agent_instance_id, lower(email_address));

DROP INDEX clients_user_id_wa_phone_key;
CREATE UNIQUE INDEX clients_instance_wa_phone_key
  ON clients (agent_instance_id, wa_phone) WHERE wa_phone IS NOT NULL;

-- Message dedupe becomes per-conversation instead of global: one inbound
-- provider message may later fan out to several instances' conversations.
-- (Constraint kept its 001 name through 004's column rename.)
ALTER TABLE emails DROP CONSTRAINT emails_gmail_message_id_key;
ALTER TABLE emails ADD CONSTRAINT emails_client_message_id_key UNIQUE (client_id, message_id);
