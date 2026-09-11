import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Re-applies the code judges to the model outputs stored in a results file - no
 * model calls, no cost. Use after changing a case's expected values or a judge:
 *
 *   npx tsx evals/rejudge.ts                       # evals/results/latest.json, in place (+ report.html)
 *   npx tsx evals/rejudge.ts --in evals/results/run-2026-09-11T09-16-31.json
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { quietRedis } = await import('./isolate.js');
quietRedis();
const { loadStage } = await import('./stages.js');
const { buildReport } = await import('./report.js');

interface StoredRow {
  stage: string;
  caseId: string;
  output: unknown;
  pass: boolean;
  checks: unknown[];
  info: unknown;
  notes: string | null;
}

const args = process.argv.slice(2);
const inFile = path.resolve(args.includes('--in') ? args[args.indexOf('--in') + 1]! : path.join(HERE, 'results', 'latest.json'));
const run = JSON.parse(fs.readFileSync(inFile, 'utf8')) as { ranAt: string; results: StoredRow[] };

const stages = new Map<string, ReturnType<typeof loadStage>>();
let changed = 0;
for (const row of run.results) {
  if (!row.output) continue;
  if (!stages.has(row.stage)) stages.set(row.stage, loadStage(row.stage));
  const { stage, ctx, cases } = stages.get(row.stage)!;
  const c = cases.find((x) => x.id === row.caseId);
  if (!c) continue;
  const { checks, info } = stage.judge(c, row.output, ctx);
  const pass = checks.every((x) => x.pass);
  if (pass !== row.pass) changed += 1;
  Object.assign(row, { checks, info, pass, notes: c.notes ?? null });
}
const json = JSON.stringify(run, null, 2);
fs.writeFileSync(inFile, json);
// Keep the run file and latest.json in step: whichever was edited, its twin (same ranAt) gets the same content.
const dir = path.dirname(inFile);
for (const name of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const twin = path.join(dir, name);
  if (path.resolve(twin) === inFile) continue;
  try {
    if ((JSON.parse(fs.readFileSync(twin, 'utf8')) as { ranAt?: string }).ranAt === run.ranAt) fs.writeFileSync(twin, json);
  } catch {
    /* not a results file */
  }
}
console.log(`re-judged ${run.results.length} rows, ${changed} verdict(s) changed -> ${inFile}`);
console.log(`report: ${await buildReport(inFile, path.join(path.dirname(inFile), 'report.html'))}`);
process.exit(0);
