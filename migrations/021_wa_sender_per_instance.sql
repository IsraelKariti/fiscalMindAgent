-- WhatsApp sender numbers become strictly per agent instance: each agent
-- instance that uses WhatsApp gets its own dedicated Twilio number, so one
-- accountant can run e.g. doc_collector and customer_service on two numbers,
-- and inbound routing by the To-number identifies the instance directly.
--
-- Existing accountant-wide numbers attach to the owner's doc_collector
-- instance (every accountant has one via the 019 backfill + sign-in
-- provisioning): doc-collector conversations are stateful (mid-flight
-- follow-ups), while customer_service is stateless Q&A and just needs a new
-- dedicated number assigned by an admin afterwards.

ALTER TABLE wa_senders
  ADD COLUMN agent_instance_id UUID REFERENCES agent_instances(id) ON DELETE CASCADE;

UPDATE wa_senders s
SET agent_instance_id = ai.id
FROM agent_instances ai
WHERE ai.user_id = s.user_id AND ai.agent_type = 'doc_collector';

-- Safety net: a row whose owner somehow lacks a doc_collector instance
-- attaches to the owner's oldest instance instead of failing SET NOT NULL.
UPDATE wa_senders s
SET agent_instance_id = (
  SELECT ai.id FROM agent_instances ai
  WHERE ai.user_id = s.user_id ORDER BY ai.created_at LIMIT 1
)
WHERE s.agent_instance_id IS NULL;

ALTER TABLE wa_senders
  ALTER COLUMN agent_instance_id SET NOT NULL,
  ADD CONSTRAINT wa_senders_agent_instance_id_key UNIQUE (agent_instance_id),
  -- Owner is now derived via agent_instances; user deletion still cascades
  -- through the instance FK.
  DROP COLUMN user_id;
