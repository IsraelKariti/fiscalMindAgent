-- The LLM's internal explanation for its follow-up decision (mainly the chosen
-- send time). Stored on the outbound draft so it survives past the console log;
-- null on inbound mail, legacy rows, and the CLI-bootstrapped first email.

ALTER TABLE emails
  ADD COLUMN reasoning TEXT;
