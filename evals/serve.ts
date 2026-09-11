import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport } from './report.js';

/**
 * Optional: serves the evals report on its own port (default 3211 - the app's
 * web process is on PORT, the GUI on GUI_PORT; no clash). Every page load
 * rebuilds report.html from evals/results/latest.json, so a run in progress
 * can be watched by refreshing. `npx tsx evals/serve.ts` -> http://127.0.0.1:3211
 * The report itself is a plain file (evals/results/report.html) and opens without this server.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, 'results');
const PORT = Number(process.env.EVALS_PORT ?? 3211);

http
  .createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url ?? '/', 'http://x');
      const name = decodeURIComponent(url.pathname).replace(/^\/+/, '') || 'report.html';
      if (name === 'report.html') {
        const wanted = url.searchParams.get('run');
        const src = path.join(RESULTS, wanted ? path.basename(wanted) : 'latest.json');
        if (!fs.existsSync(src)) {
          res.writeHead(404);
          res.end(`no results file: ${src}`);
          return;
        }
        await buildReport(src, path.join(RESULTS, 'report.html'));
      }
      const file = path.join(RESULTS, path.basename(name));
      if (!fs.existsSync(file)) {
        res.writeHead(404);
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': name.endsWith('.json') ? 'application/json' : 'text/html; charset=utf-8', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    })().catch((err: unknown) => {
      res.writeHead(500);
      res.end(err instanceof Error ? err.message : String(err));
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log(`evals report: http://127.0.0.1:${PORT}/`));
