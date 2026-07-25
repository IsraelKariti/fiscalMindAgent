-- Deleting a client failed: the audit_events FKs were ON DELETE SET NULL, so
-- Postgres tried to UPDATE the client's audit rows during the cascade — and the
-- audit_events_no_rewrite trigger (031) rejects every UPDATE, aborting the
-- whole delete. Same trap existed for the users and agent_instances FKs.
--
-- Fix: drop the FKs and keep the plain UUID columns. Audit rows now retain the
-- real historical id after the referenced row is gone, which is better
-- forensics than nulling it out — and with no FK there is no cascade action to
-- trip the append-only trigger. The columns are unconstrained references by
-- design from here on; the indexes on them keep working as before.
ALTER TABLE audit_events DROP CONSTRAINT audit_events_actor_user_id_fkey;
ALTER TABLE audit_events DROP CONSTRAINT audit_events_agent_instance_id_fkey;
ALTER TABLE audit_events DROP CONSTRAINT audit_events_client_id_fkey;
