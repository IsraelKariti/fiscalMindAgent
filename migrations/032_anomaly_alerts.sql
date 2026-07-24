-- Findings raised over the audit trail — by the periodic anomaly scan
-- (src/alerts/anomalyScan.ts) and by event-time critical audit events. One
-- open alert per (rule, scope) at a time: raiseAlert() skips insert + email
-- when a recent alert for the same rule/scope already exists, so a sustained
-- anomaly emails the admin once, not every 15 minutes.
CREATE TABLE anomaly_alerts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Rule id, e.g. 'send_volume_spike', 'critical_event:injection.cycle_suppressed'.
  rule        TEXT NOT NULL,
  -- What the rule fired on (agent instance id, user id, or '' for platform-wide) —
  -- the dedupe key together with `rule`.
  scope_key   TEXT NOT NULL DEFAULT '',
  severity    TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  title       TEXT NOT NULL,
  detail      JSONB NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acked')),
  -- When the admin notification email went out (null: send failed or skipped).
  notified_at TIMESTAMPTZ,
  acked_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  acked_at    TIMESTAMPTZ
);

CREATE INDEX anomaly_alerts_status_idx ON anomaly_alerts (status, created_at);
CREATE INDEX anomaly_alerts_dedupe_idx ON anomaly_alerts (rule, scope_key, created_at);
