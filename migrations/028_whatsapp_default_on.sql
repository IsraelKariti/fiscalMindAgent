-- WhatsApp is now on by default: any client with a usable phone number gets
-- the channel without a per-client opt-in step (new inserts handle this in
-- code; this backfills the existing roster). Mirrors normalizeE164
-- (src/util/phone.ts): strip separators, then "+..." as-is, "00..." → "+...",
-- local Israeli "0..." → "+972...". Skipped: clients that already have a
-- wa_phone, clients that ever opted out (an explicit opt-out is never
-- reversed), unparseable numbers, and duplicates — a number already used by
-- another of the instance's clients, or two backfill candidates sharing one
-- (the oldest client wins), so clients_instance_wa_phone_key can't trip.
WITH candidate AS (
  SELECT id, agent_instance_id, created_at,
         CASE
           WHEN s LIKE '+%'  THEN s
           WHEN s LIKE '00%' THEN '+' || substr(s, 3)
           WHEN s LIKE '0%'  THEN '+972' || substr(s, 2)
         END AS wa
  FROM (
    SELECT id, agent_instance_id, created_at, regexp_replace(phone, '[\s\-().]', '', 'g') AS s
    FROM clients
    WHERE phone IS NOT NULL AND wa_phone IS NULL AND wa_opted_out_at IS NULL
  ) stripped
),
chosen AS (
  SELECT DISTINCT ON (agent_instance_id, wa) id, wa
  FROM candidate
  WHERE wa ~ '^\+[1-9][0-9]{6,14}$'
    AND NOT EXISTS (
      SELECT 1 FROM clients other
      WHERE other.agent_instance_id = candidate.agent_instance_id AND other.wa_phone = candidate.wa
    )
  ORDER BY agent_instance_id, wa, created_at, id
)
UPDATE clients
SET wa_phone = chosen.wa, wa_enabled = true, wa_opted_in_at = now(), updated_at = now()
FROM chosen
WHERE clients.id = chosen.id;
