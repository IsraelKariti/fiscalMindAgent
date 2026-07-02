import express, { type Express } from 'express';
import { pubsubRoute } from './pubsubRoute.js';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.get('/healthz', (_req, res) => res.status(200).send('ok'));
  app.use(pubsubRoute);
  return app;
}
