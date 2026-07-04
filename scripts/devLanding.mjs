// Dev launcher for the landing page. Reads LANDING_PORT from the root .env so
// each clone of the repo can run the landing dev server on its own port.
import 'dotenv/config';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const port = process.env.LANDING_PORT || '3100';

const child = spawn('npx', ['next', 'dev', '-p', port], {
  cwd: fileURLToPath(new URL('../landing', import.meta.url)),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
