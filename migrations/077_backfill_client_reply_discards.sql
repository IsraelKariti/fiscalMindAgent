-- Backfilled discards whose reason can be read from the thread (openspec
-- `discarded-message-analytics`, wait curve). 076 stamped every old discarded
-- draft `unknown`. When the thread row right after such a draft is a client
-- message, the client wrote while the draft was pending and the re-plan
-- discarded it — the `client_message` reason, the one the wait curve counts.
-- A draft followed by another outbound row (a redraft, a send) stays
-- `unknown`: that cancel could have had any reason.
--
-- A guess from thread order, like the 076 triggers: a draft cancelled for
-- another reason that no new draft replaced before the client wrote reads as
-- `client_message` too. Only drafts cancelled after 076 carry the exact reason.

UPDATE emails e
SET discard_reason = 'client_message'
WHERE e.direction = 'outbound'
  AND e.discard_reason = 'unknown'
  AND e.discarded_at IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM emails n
    WHERE n.client_id = e.client_id
      AND n.id <> e.id
      AND n.direction = 'inbound'
      AND COALESCE(n.sent_at, n.created_at) = e.discarded_at
  );
