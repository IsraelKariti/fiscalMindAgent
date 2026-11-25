-- The fallback mark on a backup call's row (openspec `fallbacks-dashboard`).
-- When a stage's primary model does not serve a call, the same request goes
-- to the stage's backup model on another provider (openspec
-- `llm-model-settings`). The primary's failed row and the backup's row were
-- both recorded, but nothing linked them, so "what share of model X's calls
-- fell back" could not be read from the call log. The backup row now names
-- the primary it replaced, that model's provider, and why the primary did not
-- serve the call: 'status 400', 'timeout', 'network', 'error', or
-- 'provider held' when the primary's provider was held and the backup took
-- the call without a primary attempt. A row that was not a fallback keeps
-- NULLs.
ALTER TABLE llm_calls ADD COLUMN fallback_from_model TEXT;
ALTER TABLE llm_calls ADD COLUMN fallback_from_provider TEXT;
ALTER TABLE llm_calls ADD COLUMN fallback_reason TEXT;

CREATE INDEX llm_calls_fallback_from_idx ON llm_calls (fallback_from_model, created_at DESC)
  WHERE fallback_from_model IS NOT NULL;

-- One-time backfill from the trace: every `fallback_model` code step of a
-- client (written between the primary's error row and the backup's row)
-- marks the first unmarked row of that client, stage and backup model made
-- within 15 minutes after the step. Client-less fallbacks wrote no step and
-- stay unmarked; the dashboard says since when the mark is exact.
UPDATE llm_calls lc
SET fallback_from_model = m.from_model,
    fallback_from_provider = m.from_provider,
    fallback_reason = m.failure_reason
FROM (
  SELECT DISTINCT ON (ae.id)
         ae.id AS step_id,
         cand.id AS call_id,
         ae.detail->>'from_model' AS from_model,
         ae.detail->>'from_provider' AS from_provider,
         -- Steps older than this change wrote 'held' for a held provider; the mark says 'provider held'.
         CASE WHEN ae.detail->>'failure_reason' = 'held' THEN 'provider held' ELSE ae.detail->>'failure_reason' END AS failure_reason
  FROM audit_events ae
  JOIN LATERAL (
    SELECT c.id, c.created_at
    FROM llm_calls c
    WHERE c.client_id = ae.client_id
      AND c.purpose = ae.detail->>'purpose'
      AND c.model = ae.detail->>'to_model'
      AND c.created_at >= ae.occurred_at
      AND c.created_at < ae.occurred_at + INTERVAL '15 minutes'
      AND c.fallback_from_model IS NULL
    ORDER BY c.created_at
    LIMIT 1
  ) cand ON TRUE
  WHERE ae.action = 'fallback_model'
    AND ae.client_id IS NOT NULL
  ORDER BY ae.id, cand.created_at
) m
WHERE lc.id = m.call_id
  AND lc.fallback_from_model IS NULL;
