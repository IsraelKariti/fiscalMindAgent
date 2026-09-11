import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeCost, getPricingForModel } from '../src/gemini/pricing.js';

/**
 * Turns a results JSON (evals/run.ts output) into one self-contained HTML page:
 * evals/results/report.html - a tab per stage, a table of every model, and a
 * cost-vs-speed scatter of the models that scored 100%. No server: open the file.
 *
 *   npx tsx evals/report.ts                          # evals/results/latest.json -> evals/results/report.html
 *   npx tsx evals/report.ts --in evals/results/run-2026-09-11T09-16-31.json --out /tmp/r.html
 *
 * Cost is recomputed here from the stored tokens with the current LiteLLM price
 * table (src/gemini/pricing.ts), so a model priced after the run still gets a
 * cost. run.ts calls buildReport() at the end of every run.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE = path.join(HERE, 'report-template.html');

interface ReportRow {
  model: string;
  error: string | null;
  costUsd: number | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
}

export async function buildReport(inFile: string, outFile: string): Promise<string> {
  const run = JSON.parse(fs.readFileSync(inFile, 'utf8')) as { models?: string[]; results: ReportRow[]; pricing?: Record<string, unknown> };
  for (const r of run.results) {
    if ((r.costUsd === null || r.costUsd === undefined) && !r.error) {
      const pricing = await getPricingForModel(r.model);
      if (pricing) r.costUsd = computeCost(pricing, { inputTokens: r.inputTokens, outputTokens: r.outputTokens, thinkingTokens: r.thinkingTokens, cachedTokens: r.cachedTokens });
    }
  }
  run.pricing = {};
  for (const m of run.models ?? []) run.pricing[m] = await getPricingForModel(m);
  const json = JSON.stringify(run).replace(/<\//g, '<\\/');
  const html = fs.readFileSync(TEMPLATE, 'utf8').replace('/*__DATA__*/null', json);
  fs.writeFileSync(outFile, html);
  return outFile;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const opt = (name: string, fallback: string): string => (args.includes(name) ? args[args.indexOf(name) + 1]! : fallback);
  const inFile = path.resolve(opt('--in', path.join(HERE, 'results', 'latest.json')));
  const outFile = path.resolve(opt('--out', path.join(path.dirname(inFile), 'report.html')));
  console.log(`report: ${await buildReport(inFile, outFile)}`);
  process.exit(0);
}
