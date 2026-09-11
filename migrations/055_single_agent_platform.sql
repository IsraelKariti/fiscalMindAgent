-- The platform now hosts a single agent type, declaration_of_capital: the
-- document collector, debt collector, customer-service agent and the
-- coming-soon stubs are gone from the code, so their instances must never act
-- again. Rows are kept — an agent_instances row is never deleted (clients
-- cascade off it) — but disabled instances are dropped by every act-time
-- guard (webhooks, queued sends, daily scans) and the admin API hides
-- instances of unregistered types (same pattern as migration 041).
UPDATE agent_instances SET enabled = false WHERE agent_type <> 'declaration_of_capital';
