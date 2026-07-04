#!/usr/bin/env node
// One-shot "ship" for the multi-clone workflow (see CLAUDE.md): rebase on
// origin/master, verify server typecheck + GUI build, then push. If the other
// clone pushed in the meantime, rebase again and retry the push.
import { execSync } from 'node:child_process';

function run(cmd) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit' });
}

try {
  run('git pull --rebase origin master');
  run('npm run typecheck');
  run('npm run build:gui');

  for (let attempt = 1; ; attempt++) {
    try {
      run('git push origin master');
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      console.log('\nPush rejected — rebasing on the new remote head and retrying…');
      run('git pull --rebase origin master');
    }
  }
  console.log('\n✔ Shipped: rebased, verified, and pushed to origin/master.');
} catch {
  process.exit(1);
}
