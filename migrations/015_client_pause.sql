-- Per-client pause switch for the agent's outreach. While paused, the pending
-- scheduled send is canceled and setFutureEmail refuses to schedule new ones
-- (replies are still stored); resuming re-plans from current state.
ALTER TABLE clients
  ADD COLUMN paused BOOLEAN NOT NULL DEFAULT false;
