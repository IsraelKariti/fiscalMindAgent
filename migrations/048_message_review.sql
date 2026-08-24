-- Admin-only supervision of the declaration_of_capital live pilot. Two levers,
-- both invisible to the accountant (nothing here is ever serialized to a
-- workspace endpoint), both admin-owned and therefore columns rather than
-- accountant-editable settings JSONB — the workspace settings PUT replaces
-- that object wholesale (see 042):
--
--  * review_mode: every queued outbound message must be approved by the
--    platform admin before it may go out. The draft is flagged
--    review_status='pending' the moment it is scheduled; the send worker
--    refuses to deliver anything not 'approved' and parks late unapproved
--    drafts in the new 'held' email status. 'superseded' marks pending drafts
--    that a replan discarded before the admin acted.
--  * admin_paused (instance + per-client): an emergency brake that silently
--    stops all planning and sending for the pilot agent's clients.
--
-- Both flags only have an effect on declaration_of_capital instances — the
-- code gates on agent_type, the columns are just where the switch lives.
ALTER TABLE agent_instances ADD COLUMN review_mode BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE agent_instances ADD COLUMN admin_paused BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE clients ADD COLUMN admin_paused BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE emails ADD COLUMN review_status TEXT
  CHECK (review_status IN ('pending', 'approved', 'superseded'));
ALTER TABLE emails ADD COLUMN held_at TIMESTAMPTZ;

-- 'held' = the scheduled send time arrived while the draft still awaited admin
-- approval; the worker parked it instead of sending. Approval flips it back to
-- 'draft' and re-enqueues an immediate send. Every accountant-facing reader
-- filters status positively ('sent'/'received', or 'draft' in the worker), so
-- held rows are invisible outside the admin review queue.
ALTER TABLE emails DROP CONSTRAINT emails_status_valid;
ALTER TABLE emails ADD CONSTRAINT emails_status_valid CHECK (
  (direction = 'outbound' AND status IN ('draft', 'held', 'sent')) OR
  (direction = 'inbound' AND status = 'received')
);

-- The review queue scans by pending state; keep it O(pending), not O(all mail).
CREATE INDEX emails_review_pending_idx ON emails (created_at) WHERE review_status = 'pending';
