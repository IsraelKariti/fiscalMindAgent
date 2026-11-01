-- Collection window (openspec `collection-window`): how many days the agent
-- chases a client after its first delivered message. At first contact the
-- declaration-of-capital agent stamps agent_fields.due_date = delivery date +
-- this many days (unless the accountant set a date by hand); the existing
-- overdue scan then stops the chase the night after that date. Admin-set on
-- the agent page, like tax_year. Existing instances get the 14-day default.
ALTER TABLE agent_instances
  ADD COLUMN collection_window_days integer NOT NULL DEFAULT 14
  CHECK (collection_window_days BETWEEN 1 AND 365);
