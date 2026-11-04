-- First-message approval (openspec `first-message-approval`, change
-- `configurable-kickoff`): whether a manual-kickoff instance enrolls its
-- clients paused so the first message is drafted and HELD until the
-- accountant resumes (true = today's behaviour), or enrolls them running so
-- the first message is queued for its planned time with no Resume click
-- (false). A column rather than a key inside the accountant-editable settings
-- JSONB: the workspace settings PUT replaces that object wholesale, and this
-- flag is admin-owned (set on the admin agent page, like collection_window_days).
-- Applies to clients enrolled after a switch; existing clients are untouched.
ALTER TABLE agent_instances
  ADD COLUMN first_message_approval boolean NOT NULL DEFAULT true;
