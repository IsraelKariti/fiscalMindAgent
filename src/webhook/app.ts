import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { resendRoute } from './resendRoute.js';
import { apiRouter } from '../api/router.js';

// Built dashboard SPA (web/dist), resolved from the process cwd — both `npm run
// dev:web` and `npm run start:web` are executed from the repo root.
const guiDist = path.resolve(process.cwd(), 'web/dist');

export function createApp(): Express {
  const app = express();
  // The Resend webhook must come before express.json(): Svix signature
  // verification needs the raw request body.
  app.use(resendRoute);
  app.use(express.json());
  app.get('/healthz', (_req, res) => res.status(200).send('ok'));
  app.use('/api', apiRouter);

  if (fs.existsSync(path.join(guiDist, 'index.html'))) {
    app.use(express.static(guiDist));
    // SPA fallback: let client-side routing handle any other GET path.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/webhooks')) return next();
      res.sendFile(path.join(guiDist, 'index.html'));
    });
  }

  return app;
}
