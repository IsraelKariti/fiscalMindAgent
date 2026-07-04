# fiscalMindAgent — repo instructions

## Git workflow (multiple clones push to master)

Several local clones of this repo are worked on in parallel and all push
directly to `master`. When committing:

1. `git pull --rebase origin master` first, and resolve any conflicts.
2. Run `npm run typecheck` before committing.
3. Commit, then `git push origin master`. If the push is rejected because the
   other clone pushed in the meantime, `git pull --rebase origin master` and
   push again.
4. Never commit `.env` — each clone has its own (different ports, secrets,
   ngrok domain). Document new env vars in `.env.example` instead.

## Dev stack

The user runs `npm run dev` in their own terminal — never start it (or its
parts) from Claude's shell. All dev ports are driven by the root `.env`
(`PORT`, `GUI_PORT`, `LANDING_PORT`, `*_HOST_PORT`, `NGROK_DOMAIN`,
`COMPOSE_PROJECT_NAME`) so clones can run side by side.
