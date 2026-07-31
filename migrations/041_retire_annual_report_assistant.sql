-- Retires the annual_report_assistant agent type: the code no longer registers
-- it, so its instances must never act again. Rows are kept — an agent_instances
-- row is never deleted (clients cascade off it) — but disabled instances are
-- dropped by every act-time guard (webhooks, queued sends, daily scans) and the
-- admin API hides instances of unregistered types.
UPDATE agent_instances SET enabled = false WHERE agent_type = 'annual_report_assistant';
