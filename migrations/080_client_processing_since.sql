-- Turn activity states (openspec `turn-activity-states`).
-- A second activity stamp beside drafting_since: set while the inputs of a
-- client's turn are being analyzed (inbound media stored, files split and
-- classified, collected documents verified). drafting_since keeps its one
-- meaning — a planner run is writing the message. The workspace shows
-- "processing" for the first, "drafting" for the second, and nothing while
-- the agent only waits for a timer (quiet window, after-send delay).
-- Cleared when the planner takes over (markDraftingStarted), when the wait
-- loop sees only the quiet window left, and with the drafting state.
ALTER TABLE clients ADD COLUMN processing_since TIMESTAMPTZ NULL;
