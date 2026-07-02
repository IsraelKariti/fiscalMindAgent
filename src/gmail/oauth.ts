import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../config/env.js';
import { createOAuth2Client } from './client.js';
import { logger } from '../util/logger.js';

const SCOPES = ['https://www.googleapis.com/auth/gmail.send', 'https://www.googleapis.com/auth/gmail.readonly'];

async function main(): Promise<void> {
  const oauth2Client = createOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
  });

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer((req, res) => {
      if (!req.url?.startsWith('/oauth2callback')) {
        res.writeHead(404).end();
        return;
      }
      const url = new URL(req.url, 'http://localhost:5555');
      const returnedCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(error ? `Authorization failed: ${error}. You can close this tab.` : 'Authorization complete. You can close this tab.');
      server.close();
      if (error) reject(new Error(`OAuth consent denied/failed: ${error}`));
      else if (returnedCode) resolve(returnedCode);
      else reject(new Error('No code or error returned on OAuth callback'));
    });
    server.listen(5555, () => {
      logger.info('Open this URL to authorize Gmail access:');
      console.log(`\n${authUrl}\n`);
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  await mkdir(path.dirname(env.GMAIL_TOKEN_PATH), { recursive: true });
  await writeFile(env.GMAIL_TOKEN_PATH, JSON.stringify(tokens, null, 2), { mode: 0o600 });
  logger.info(`Tokens saved to ${env.GMAIL_TOKEN_PATH}`);
}

main().catch((err) => {
  logger.error('Gmail OAuth flow failed', err);
  process.exit(1);
});
