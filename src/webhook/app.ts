import fs from 'node:fs';
import path from 'node:path';
import express, { type Express } from 'express';
import { resendRoute } from './resendRoute.js';
import { twilioRoute } from './twilioRoute.js';
import { apiRouter } from '../api/router.js';

// Built dashboard SPA (web/dist), resolved from the process cwd — both `npm run
// dev:web` and `npm run start:web` are executed from the repo root.
const guiDist = path.resolve(process.cwd(), 'web/dist');

export function createApp(): Express {
  const app = express();
  // The webhooks must come before express.json(): Resend/Svix signature
  // verification needs the raw request body, and Twilio posts form-encoded
  // params parsed by the route itself.
  app.use(resendRoute);
  app.use(twilioRoute);
  app.use(express.json());
  app.get('/healthz', (_req, res) => res.status(200).send('ok'));
  app.use('/api', apiRouter);

  if (fs.existsSync(path.join(guiDist, 'index.html'))) {
    // monday.com iframe entries (built alongside the SPA): the dashboard
    // widget at /monday-widget and the custom-object full app at
    // /monday-object. Only these documents are embeddable, and only by monday
    // — the frame-ancestors CSP is the framing allowlist (nothing else sets
    // framing headers, and both authenticate with monday session tokens, not
    // the session cookie).
    const serveMondayDoc = (routes: string[], file: string) =>
      app.get(routes, (_req, res, next) => {
        const doc = path.join(guiDist, file);
        if (!fs.existsSync(doc)) return next();
        res.setHeader('Content-Security-Policy', 'frame-ancestors https://*.monday.com https://monday.com');
        res.sendFile(doc);
      });
    serveMondayDoc(['/monday-widget', '/monday-widget.html'], 'monday-widget.html');
    serveMondayDoc(['/monday-object', '/monday-object.html'], 'monday-object.html');
    app.use(express.static(guiDist));
    // SPA fallback: let client-side routing handle any other GET path.
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/webhooks')) return next();
      res.sendFile(path.join(guiDist, 'index.html'));
    });
  }

  return app;
}
