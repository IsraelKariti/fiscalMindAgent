-- Third template purpose: `handoff` (openspec `whatsapp-templates`, change
-- handoff-notice-to-client).
--
-- `handoff` = the fixed notice a client receives on the business morning after
-- the agent stopped at the end of the collection window (openspec
-- `handoff-notice`). The planner is never offered a handoff template; code
-- sends it. The template itself (finish_conversation) is seeded by a
-- later migration, once Meta approved it and its Content SID exists.
-- Idempotent: the DROP is IF EXISTS and the ADD re-creates the same check.

ALTER TABLE wa_templates DROP CONSTRAINT IF EXISTS wa_templates_purpose_check;
ALTER TABLE wa_templates
  ADD CONSTRAINT wa_templates_purpose_check CHECK (purpose IN ('intro', 'reopen', 'handoff'));
