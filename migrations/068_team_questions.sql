-- Questions the agent asks the client's team member (openspec
-- `team-questions`). One row per `ask_team` planner call: who it was
-- addressed to (the client's stored tax advisor when matched, else the
-- accountant), the question and the reason, and later how it was closed:
-- 'answered' (an answer for the agent to relay — closed_text required) or
-- 'handled_outside' (the team member already spoke to the client —
-- closed_text is an optional note). At most one open question per client.
CREATE TABLE team_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  agent_instance_id UUID NOT NULL REFERENCES agent_instances(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  -- The inbound message the question rests on (emails.id); NULL when none.
  evidence_message_id UUID NULL REFERENCES emails(id) ON DELETE SET NULL,
  asked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  to_email TEXT NOT NULL,
  to_name TEXT NOT NULL,
  to_match TEXT NOT NULL CHECK (to_match IN ('accountant', 'staff')),
  closed_how TEXT NULL CHECK (closed_how IN ('answered', 'handled_outside')),
  closed_text TEXT NULL,
  closed_at TIMESTAMPTZ NULL,
  closed_by UUID NULL REFERENCES users(id) ON DELETE SET NULL,
  closed_by_name TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT team_questions_closed_consistent CHECK (
    (closed_how IS NULL AND closed_at IS NULL AND closed_text IS NULL AND closed_by_name IS NULL)
    OR (closed_how = 'answered' AND closed_at IS NOT NULL AND closed_text IS NOT NULL AND length(btrim(closed_text)) > 0)
    OR (closed_how = 'handled_outside' AND closed_at IS NOT NULL)
  )
);

-- One open question per client, enforced by the database (the gate checks too).
CREATE UNIQUE INDEX team_questions_one_open_per_client ON team_questions (client_id) WHERE closed_at IS NULL;
-- The roster's open-question lookup.
CREATE INDEX team_questions_open_by_instance ON team_questions (agent_instance_id) WHERE closed_at IS NULL;
CREATE INDEX team_questions_by_client ON team_questions (client_id, asked_at DESC);
