-- The app version that made each LLM call (openspec `cost-per-version`).
-- Every call row already records its cost and tokens, but nothing said which
-- build of the app made it, so after a deploy there was no way to tell
-- whether a prompt, schema or model change made the agent cheaper. The row
-- now carries the short git commit the process was built from (GIT_SHA in
-- the containers, the working-tree commit locally, 'dev' when unknown). Old
-- rows stay NULL: the admin versions page groups them as "before versions".
ALTER TABLE llm_calls ADD COLUMN app_version TEXT;

CREATE INDEX llm_calls_app_version_idx ON llm_calls (app_version, created_at DESC);
