-- What became of every outbound draft (openspec `discarded-message-analytics`).
-- A planning cycle ends in a scheduled draft; a client reply, a verification,
-- a tax fetch or an admin action cancels it and drafts again. Until now the
-- cancel (removeFutureEmail) deleted the scheduled_jobs mirror row — the only
-- holder of the planned time — and left the emails row untouched, so nothing
-- said when a draft died, why, what started the cycle that wrote it, or what
-- its planner calls cost. The admin analytics tab reads these columns.
--
--  * plan_trigger : what started the planning cycle that wrote the draft.
--  * scheduled_for: the planned send time, kept after the mirror row goes.
--  * discarded_at / discard_reason: stamped by removeFutureEmail when the
--    pending draft is cancelled and will not be sent. NULL on sent, pending
--    and held rows.
--  * plan_run_id : the cycle id; every llm_calls row of the same cycle carries
--    it, so a draft's cost = SUM(llm_calls.cost) of its cycle. NULL on rows
--    written before this migration — their cost is unknown, never zero.

ALTER TABLE emails
  ADD COLUMN plan_trigger TEXT
    CHECK (plan_trigger IN (
      'client_message', 'agent_message_sent', 'file_verification', 'tax_fetch',
      'kickoff', 'team_answer', 'admin_redraft', 'review_regenerate',
      'admin_unpause', 'resume', 'goal_reopened', 'channel_changed'
    )),
  ADD COLUMN scheduled_for TIMESTAMPTZ,
  ADD COLUMN discarded_at TIMESTAMPTZ,
  ADD COLUMN discard_reason TEXT
    CHECK (discard_reason IN (
      'client_message', 'file_verification', 'tax_fetch', 'admin_redraft',
      'admin_pause', 'resume', 'client_declined', 'goal_changed',
      'channel_changed', 'client_deleted', 'send_settled', 'review_regenerate',
      'unknown'
    )),
  ADD COLUMN plan_run_id UUID;

ALTER TABLE llm_calls ADD COLUMN plan_run_id UUID;

CREATE INDEX llm_calls_plan_run_idx ON llm_calls (plan_run_id) WHERE plan_run_id IS NOT NULL;
CREATE INDEX emails_discarded_idx ON emails (client_id, discarded_at) WHERE discarded_at IS NOT NULL;

-- Backfill 1: the trigger, guessed from the thread row right before the draft
-- (a delivered row: inbound, or outbound sent). Earlier unsent drafts are
-- skipped — they were discarded, never delivered. Nothing before = kickoff.
UPDATE emails e
SET plan_trigger = COALESCE(
  (
    SELECT CASE WHEN p.direction = 'inbound' THEN 'client_message' ELSE 'agent_message_sent' END
    FROM emails p
    WHERE p.client_id = e.client_id
      AND p.id <> e.id
      AND (p.direction = 'inbound' OR p.status = 'sent')
      AND COALESCE(p.sent_at, p.created_at) <= e.created_at
    ORDER BY COALESCE(p.sent_at, p.created_at) DESC
    LIMIT 1
  ),
  'kickoff'
)
WHERE e.direction = 'outbound' AND e.plan_trigger IS NULL;

-- Backfill 2: old discarded drafts = unsent outbound rows that are not the
-- client's live pending draft (the scheduled_jobs mirror row names it as the
-- third ':'-separated part of its job id). Discard time ≈ the next thread row
-- after the draft; reason unknown.
UPDATE emails e
SET discarded_at = (
      SELECT MIN(COALESCE(n.sent_at, n.created_at))
      FROM emails n
      WHERE n.client_id = e.client_id AND n.id <> e.id AND n.created_at > e.created_at
    ),
    discard_reason = 'unknown'
WHERE e.direction = 'outbound'
  AND e.status IN ('draft', 'held')
  AND e.discarded_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM scheduled_jobs sj
    WHERE sj.client_id = e.client_id AND split_part(sj.bullmq_job_id, ':', 3) = e.id::text
  );

-- Backfill 3: the planned send time from the draft's scheduling step in the
-- audit trail (detail.sendAt is the accountant-timezone wall-clock label
-- "YYYY-MM-DD HH:MM[:SS]" written by sendAtGuard.wallClockLabel).
UPDATE emails e
SET scheduled_for = (
  SELECT (a.detail->>'sendAt')::timestamp AT TIME ZONE 'Asia/Jerusalem'
  FROM audit_events a
  WHERE a.client_id = e.client_id
    AND a.action IN ('send_reply', 'send_whatsapp_text', 'send_whatsapp_template')
    AND a.detail->>'emailId' = e.id::text
    AND a.detail->>'sendAt' ~ '^\d{4}-\d{2}-\d{2} \d{2}:\d{2}'
  ORDER BY a.occurred_at DESC
  LIMIT 1
)
WHERE e.direction = 'outbound' AND e.scheduled_for IS NULL;

-- Live pending/held drafts still have their mirror row: copy its planned time
-- so the analytics do not wait for the next cycle.
UPDATE emails e
SET scheduled_for = sj.scheduled_for
FROM scheduled_jobs sj
WHERE sj.client_id = e.client_id
  AND split_part(sj.bullmq_job_id, ':', 3) = e.id::text
  AND e.scheduled_for IS NULL;
