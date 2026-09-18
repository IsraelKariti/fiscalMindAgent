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

## Dev stack

The user runs `npm run dev` in their own terminal — never start it (or its
parts) from Claude's shell. Dev ports are driven by the root `.env`
(`PORT`, `GUI_PORT`, `LANDING_PORT`, `*_HOST_PORT`, `NGROK_DOMAIN`,
`COMPOSE_PROJECT_NAME`).

## Multi-agent architecture

The app is a multi-agent platform (agent-type registries, per-instance
clients) that currently hosts a single agent type, `declaration_of_capital`
(`src/agents/declarationOfCapital/`) — **read `docs/agents.md` before
touching agent behavior, the workspace API, or the workspace UI**. Key
invariants:

- Agent types are code (`src/agents/<type>/` + `web/src/agents/<type>.tsx`,
  both registries); which accountant has which type enabled lives in the
  `agent_instances` table. Clients belong to one instance
  (`clients.agent_instance_id`).
- Never DELETE an `agent_instances` row — clients cascade off it. Disable =
  `enabled=false` (admin panel or `/api/admin/accountants/:userId/agents`).
- After pulling a migration, run `npm run db:migrate` locally; production
  runs migrations during its deploy flow.
