-- Drafting status surfaced to the UI. drafting_since is stamped when a planning
-- attempt (setFutureEmail) starts and cleared when it finishes; draft_failed_at is
-- set when the attempt throws. The timeline uses them to replace the eternal
-- "drafting…" placeholder with a failed/stuck notice and a Retry button: a set
-- draft_failed_at means an observed failure, and a drafting_since that is minutes
-- old with nothing scheduled means the attempt was killed mid-flight (crash or
-- dev-server restart) and will never finish.
ALTER TABLE clients
  ADD COLUMN drafting_since TIMESTAMPTZ,
  ADD COLUMN draft_failed_at TIMESTAMPTZ;
