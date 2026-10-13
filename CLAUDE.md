# fiscalMindAgent — repo instructions

## Git workflow

Work happens directly on `master`. When committing:

1. `git pull --rebase origin master` first, and resolve any conflicts.
2. Run `npm run typecheck` before committing.
3. Commit, then `git push origin master`. If the push is rejected,
   `git pull --rebase origin master` and push again.
4. Never commit `.env` — it holds local ports, secrets, and the ngrok domain.
   Document new env vars in `.env.example` instead.

## OpenSpec workflow (required for feature work)

This repo uses OpenSpec (`openspec/`, skills in `.claude/skills/openspec-*`,
commands `/opsx:*`). Any change that adds, removes, or alters user-visible
behavior goes through it — do not start editing code from a plain feature
request.

1. Unclear problem or several options → `/opsx:explore` first (read-only;
   asks before writing anything).
2. Plan → `/opsx:propose <kebab-name>` creates `openspec/changes/<name>/`
   with proposal, delta spec, design, tasks. Stop there; the user reviews.
3. Plan corrections → `/opsx:update`, never by editing code.
4. Implement → `/opsx:apply <name>` only after the user asks. Work
   `tasks.md` top to bottom and tick each box when its behavior is fully
   built. Commit per the Git workflow above as tasks complete.
5. Done → `/opsx:archive <name>`, accept "Sync now" so the delta lands in
   `openspec/specs/`.

Skip OpenSpec only for: bug fixes with no behavior change, refactors,
tooling, docs, dependency bumps, and one-line tweaks. When in doubt, ask
whether the user wants a change proposal.

Always read `openspec/specs/` for the affected capability before planning;
never create a change folder by hand (use `openspec new change`); never
delete an `openspec/changes/` folder — archive it.

## Notion

Before creating or editing any Notion page, read `STYLE.md` (repo root) and
follow it. It holds the user's layout preferences for Notion — first rule:
cards (big title, small inner data) instead of table rows.

When the user makes a style request about a Notion page (layout, wording,
diagrams, text size), also record it as a rule in `STYLE.md` in the same
turn, so the next sessions follow it. Update an existing rule instead of
adding a duplicate.

## Dev stack

The user runs `npm run dev` in their own terminal — never start it (or its
parts) from Claude's shell. Dev ports are driven by the root `.env`
(`PORT`, `GUI_PORT`, `LANDING_PORT`, `*_HOST_PORT`, `NGROK_DOMAIN`,
`COMPOSE_PROJECT_NAME`).

## Step links

When the user pastes a step link (`<site>/#/steps/<id>`), read it with
`npm run step -- "<link>"` — it prints that code step from the local
database. Never fetch the link over HTTP (the site needs a login). The
script reads the local database only; for a step from another host see
"Production problems" below. Pasted "copy details" text (the link, then
JSON) is complete on its own — no lookup needed.

LLM call links (`<site>/#/llm-calls/<id>`) work the same way: read a local
one with `npm run call -- "<link>"` (prints the call: prompt, response,
model, file).

## Production problems

Production data IS readable from this machine. Never say "I cannot read
production" and never ask the user to paste anything before trying the
routes below. The shell is logged in to Azure (`az account show` →
"FiscalMind Production"), and the user's Chrome is logged in to
`https://agent.fiscalmind.app` as admin.

A client URL `.../#/as/<email>/agents/<instanceId>/clients/<clientId>` gives
the client id; grep for it everywhere.

1. **Logs** (no credential needed):
   `az webapp log download --name fiscalmind-il-worker --resource-group
   fiscalmind-israel --log-file <scratch>/worker.zip` (same for
   `fiscalmind-il-web`; sandbox apps are `sandbox-il-*`). Unzip, grep
   `LogFiles/*_default_docker.log` for the client id, read the ERROR line and
   its stack trace. Planner/queue work logs in the worker, manual UI actions
   (redraft, resume) in the web app. Timestamps are UTC (Israel = +3 summer,
   +2 winter).
2. **Deployed code**: production runs an older commit than master. Read the
   image tag with `az webapp config container show --name fiscalmind-il-worker
   --resource-group fiscalmind-israel` (the sha after `fiscalmind-agent:`)
   and read code at that commit with `git show <sha>:<path>`, not HEAD.
3. **Database rows (LLM calls, steps, conversation)** through the user's
   Chrome with the browser tools. Load them, then open a NEW tab directly on
   a JSON API URL, e.g.
   `https://agent.fiscalmind.app/api/admin/llm-calls?clientId=<clientId>&limit=40`.
   Read it with `get_page_text`, or run `fetch('/api/admin/llm-calls/<callId>',
   {credentials:'include'})` in the javascript tool and print only the slices
   you need (the tool output is cut at ~1.5 KB). Useful endpoints:
   `/api/admin/llm-calls/<callId>` (request = prompt + schema, response),
   `/api/admin/audit-events/<stepId>` (one code step),
   `/api/admin/clients/<clientId>/conversation` (messages, calls, steps).
   Never open the client workspace page itself first: its live streams freeze
   the tab for every later tool call. If a tab stops answering, create a new
   one instead of retrying.
4. Only if Chrome is unavailable: ask the user for the step or call modal's
   "copy details" text.

Not reachable: a direct connection to the production Postgres (firewall
allows Azure IPs only) and the app-setting secrets (blocked by the permission
filter). Do not try them.

## Multi-agent architecture

The app is a multi-agent platform (agent-type registries, per-instance
clients) that currently hosts a single agent type, `declaration_of_capital`
(`src/agents/declarationOfCapital/`) — **read `docs/agents.md` before
touching agent behavior, the workspace API, or the workspace UI**.
`docs/pipeline.md` maps every step and decision of the conversation to its
named function: every junction of a flow chart is one function, keep it that
way when adding a step (one named single-purpose function, listed there). Key
invariants:

- Agent types are code (`src/agents/<type>/` + `web/src/agents/<type>.tsx`,
  both registries); which accountant has which type enabled lives in the
  `agent_instances` table. Clients belong to one instance
  (`clients.agent_instance_id`).
- Never DELETE an `agent_instances` row — clients cascade off it. Disable =
  `enabled=false` (admin panel or `/api/admin/accountants/:userId/agents`).
- After pulling a migration, run `npm run db:migrate` locally; production
  runs migrations during its deploy flow.
