-- Allow dots in agent address local parts (e.g. paltiel.efrati@...), matching
-- the widened API regex in src/api/admin.ts. Dots follow the usual email
-- rules: not at the edges, no consecutive dots. Routing is unaffected — it
-- stays exact-match on the full address, never parsed.

ALTER TABLE agent_mailboxes DROP CONSTRAINT agent_mailboxes_local_part_check;
ALTER TABLE agent_mailboxes
  ADD CONSTRAINT agent_mailboxes_local_part_check
  CHECK (local_part ~ '^[a-z0-9]([a-z0-9.-]{1,38}[a-z0-9])?$' AND local_part !~ '\.\.');
