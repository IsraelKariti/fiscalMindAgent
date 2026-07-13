# fiscalMindAgent — repo instructions

## Git workflow

Work happens directly on `master`. When committing:

1. `git pull --rebase origin master` first, and resolve any conflicts.
2. Run `npm run typecheck` before committing.
3. Commit, then `git push origin master`. If the push is rejected,
   `git pull --rebase origin master` and push again.
4. Never commit `.env` — it holds local ports, secrets, and the ngrok domain.
   Document new env vars in `.env.example` instead.

## Dev stack

The user runs `npm run dev` in their own terminal — never start it (or its
parts) from Claude's shell. Dev ports are driven by the root `.env`
(`PORT`, `GUI_PORT`, `LANDING_PORT`, `*_HOST_PORT`, `NGROK_DOMAIN`,
`COMPOSE_PROJECT_NAME`).

## Multi-agent architecture

The app hosts multiple agent types (doc collector, debt-collector stub, …)
behind one dashboard — **read `docs/agents.md` before touching agent
behavior, the workspace API, or the workspace UI**. Key invariants:

- Agent types are code (`src/agents/<type>/` + `web/src/agents/<type>.tsx`,
  both registries); which accountant has which type enabled lives in the
  `agent_instances` table. Clients belong to one instance
  (`clients.agent_instance_id`).
- Never DELETE an `agent_instances` row — clients cascade off it. Disable =
  `enabled=false` (admin panel or `/api/admin/accountants/:userId/agents`).
- After pulling a migration, run `npm run db:migrate` locally; production
  runs migrations during its deploy flow.
