-- Admin test clients (openspec `admin-test-client`). An admin viewing the
-- workspace as an accountant can add a hand-filled client to the accountant's
-- agent for testing. The flag keeps it out of every accountant-facing roster
-- (client list, dashboard, counts, overdue scan); only the admin's view-as
-- session lists it and acts on it. Work paths (planner, sends, inbound
-- routing) treat it like any live client.
ALTER TABLE clients ADD COLUMN is_test BOOLEAN NOT NULL DEFAULT false;
