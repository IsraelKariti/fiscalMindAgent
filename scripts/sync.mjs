#!/usr/bin/env node
// Pull-side counterpart to ship.mjs (see CLAUDE.md): rebase on origin/master,
// install any new dependencies, make sure Postgres is up, then apply pending
// migrations.
import { execSync } from 'node:child_process';

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

try {
  run('git pull --rebase origin master');
  run('npm install');
  run('docker compose up -d --wait');
  run('npm run db:migrate');
  console.log('\n✔ Synced: pulled, installed, and migrated.');
} catch {
  process.exit(1);
}
