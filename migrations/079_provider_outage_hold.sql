-- Provider outage hold (openspec `llm-provider-outage`).
-- When a model provider cannot serve calls for a reason on our side (no
-- credits, bad key, quota, outage, the daily spend cap), the work that needs
-- it is held instead of judged: a message waits for its safety check (not
-- withheld), a file stays pending (not quarantined), a client waits for the
-- system (not draft-failed). These markers are what the recovery re-runs
-- when the provider answers again; the hold itself lives in app_settings
-- (`llm_outage`) so the web and the worker share it.

-- Inbound message whose injection screen could not run: never shown to a
-- model until screened. Cleared by the screen when it runs.
ALTER TABLE emails ADD COLUMN screen_pending BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX emails_screen_pending_idx ON emails (client_id) WHERE screen_pending;

-- Inbound file whose screen / split / classification stopped on the hold:
-- analysis_status stays 'pending'. Cleared when the analysis runs again.
ALTER TABLE document_files ADD COLUMN outage_held_at TIMESTAMPTZ;
CREATE INDEX document_files_outage_held_idx ON document_files (client_id) WHERE outage_held_at IS NOT NULL;

-- Client with held work (a held message/file, or a planner run stopped by
-- the hold): the workspace shows "waiting for the system", the recovery
-- re-plans it. outage_ack_sent_at: the one calm acknowledgement per hold.
ALTER TABLE clients ADD COLUMN outage_held_at TIMESTAMPTZ;
ALTER TABLE clients ADD COLUMN outage_held_provider TEXT;
ALTER TABLE clients ADD COLUMN outage_ack_sent_at TIMESTAMPTZ;
CREATE INDEX clients_outage_held_idx ON clients (id) WHERE outage_held_at IS NOT NULL;
