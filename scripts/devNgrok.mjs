// Dev launcher for the ngrok tunnel. Reads NGROK_DOMAIN and PORT from the root
// .env so each clone of the repo can tunnel its own web server on its own
// reserved domain.
import 'dotenv/config';
import { spawn } from 'node:child_process';

const domain = process.env.NGROK_DOMAIN;
const port = process.env.PORT || '3000';

if (!domain) {
  console.error('devNgrok: NGROK_DOMAIN is not set in .env — skipping ngrok tunnel.');
  process.exit(0);
}

const child = spawn('ngrok', ['http', `--domain=${domain}`, port], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
child.on('exit', (code) => process.exit(code ?? 0));
