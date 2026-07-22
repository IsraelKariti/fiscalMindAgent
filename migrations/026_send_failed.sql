-- Set when the tracked send job's attempt threw (e.g. the email provider
-- rejected it). The row and its draft are kept so the timeline can show the
-- draft in a failed state with a manual Retry; scheduling anything fresh for
-- the client clears the flag.
ALTER TABLE scheduled_jobs
  ADD COLUMN send_failed_at TIMESTAMPTZ;
