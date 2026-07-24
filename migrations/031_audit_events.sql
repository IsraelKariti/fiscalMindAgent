-- Per-action audit trail: one row per consequential action anywhere in the
-- platform — outbound email/WhatsApp, tax-authority logins, LLM-driven status
-- changes, auto-enrollment, and every mutating admin API call. This is the
-- forensic record the anomaly scanner and the admin audit page read; the
-- llm_usage tables count tokens only and cannot answer "what did the agent do,
-- to whom, when".
--
-- Deliberate deviations from house conventions, both because audit history
-- must outlive the things it describes:
--   * FKs are ON DELETE SET NULL, not CASCADE — deleting a client must not
--     erase the record of what was done for that client. Callers put
--     human-readable labels (client name, instance name) in `detail` so rows
--     stay meaningful after the FK nulls out.
--   * The trigger below is the repo's first DB-side logic: it makes the table
--     append-only at the database layer, which is the "immutable" guarantee an
--     audit log needs — application-level convention alone can be edited away.
CREATE TABLE audit_events (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Who acted: 'agent' (LLM-driven), 'admin' (admin API), 'accountant'
  -- (workspace UI), 'system' (scheduled sweeps, webhooks acting on their own).
  actor_type          TEXT NOT NULL CHECK (actor_type IN ('agent', 'admin', 'accountant', 'system')),
  -- The human behind the action when there is one. For admin actions this is
  -- the REAL signed-in admin (req.realUserId), so actions taken while
  -- impersonating attribute to the admin, not the impersonated accountant.
  actor_user_id       UUID REFERENCES users(id) ON DELETE SET NULL,
  agent_instance_id   UUID REFERENCES agent_instances(id) ON DELETE SET NULL,
  client_id           UUID REFERENCES clients(id) ON DELETE SET NULL,
  -- Dot-namespaced verb, e.g. 'email.client_sent', 'tax_fetch.login_started',
  -- 'injection.cycle_suppressed', 'admin.kill_switch_set'. Validated in code
  -- (src/audit/actions.ts), like agent_instances.agent_type.
  action              TEXT NOT NULL,
  -- What the action touched, when it isn't just the client: 'email', 'wa_message',
  -- 'client_document', 'tax_fetch_session', 'whitelist_entry', ...
  target_type         TEXT,
  target_id           TEXT,
  severity            TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('info', 'warning', 'critical')),
  -- True when the recorded cycle/action tripped the prompt-injection defenses
  -- (suspected_injection in a planner decision, tripwire at ingestion).
  suspected_injection BOOLEAN NOT NULL DEFAULT false,
  detail              JSONB NOT NULL DEFAULT '{}'
);

CREATE INDEX audit_events_time_idx     ON audit_events (occurred_at);
CREATE INDEX audit_events_instance_idx ON audit_events (agent_instance_id, occurred_at);
CREATE INDEX audit_events_action_idx   ON audit_events (action, occurred_at);
CREATE INDEX audit_events_client_idx   ON audit_events (client_id, occurred_at);

-- Append-only enforcement. The application role owns the table, so REVOKE
-- can't protect the log from the application itself; a trigger can.
CREATE FUNCTION audit_events_immutable() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_rewrite
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_immutable();
