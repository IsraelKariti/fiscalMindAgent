-- The tax year an agent instance collects documents for (e.g. 2025). Admin-owned
-- (set in the activation modal, like the instance's email address), so it lives
-- as a column rather than inside the accountant-editable settings JSONB — the
-- workspace settings PUT replaces that object wholesale. NULL = not configured;
-- code falls back to the most recently concluded calendar year. Today only the
-- doc collector uses it (collectsTaxYear on the type definition).
ALTER TABLE agent_instances ADD COLUMN tax_year integer;
