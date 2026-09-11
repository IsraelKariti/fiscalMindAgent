import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Runs every case of every stage against every model and stores one JSON file
 * with the raw rows (tokens, latency, cost, checks, the model's parsed output)
 * and a stage x model summary. Judged in code only (evals/stages.ts).
 *
 *   npx tsx evals/run.ts
 *   npx tsx evals/run.ts --stages injection_screen,analyze_file --models gemini-2.5-flash,gpt-5.6-luna
 *   npx tsx evals/run.ts --cases inj_06,cls_09 --concurrency 2 --out evals/results/smoke.json
 *
 * Every request goes through the platform's own build*Call factories and
 * runLlmCall() with an explicit `model` (so no app_settings read — the DB is
 * never touched) and a file log sink (evals/data/llm_calls.jsonl, gitignored)
 * instead of the llm_calls table. Spend cap: EVALS_MAX_SPEND_USD (default 30),
 * summed from this run's own priced rows before every call.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url));

interface Args {
  stages?: string[];
  models?: string[];
  cases?: string[];
  concurrency: number;
  out?: string;
}

function parseArgs(argv: string[]): Args {
  const out: Args = { concurrency: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === '--stages') out.stages = next().split(',');
    else if (a === '--models') out.models = next().split(',');
    else if (a === '--cases') out.cases = next().split(',');
    else if (a === '--concurrency') out.concurrency = Number(next());
    else if (a === '--out') out.out = next();
    else if (a === '--help' || a === '-h') {
      console.log('usage: npx tsx evals/run.ts [--stages a,b] [--models x,y] [--cases id,id] [--concurrency N] [--out file.json]');
      process.exit(0);
    } else throw new Error(`unknown argument ${a}`);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));

// The platform modules load .env (src/config/env.ts) at import; nothing below
// reads the DB as long as runLlmCall always gets an explicit model. isolate.ts
// goes first so the Redis client one of them opens at import is closed quietly.
const { quietRedis } = await import('./isolate.js');
quietRedis();
const { runLlmCall } = await import('../src/gemini/llmCall.js');
const { LLM_MODEL_OPTIONS, providerForModel } = await import('../src/gemini/modelCatalog.js');
const { computeCost, getPricingForModel } = await import('../src/gemini/pricing.js');
const { env } = await import('../src/config/env.js');
const { loadStage, STAGE_NAMES } = await import('./stages.js');
const { buildReport } = await import('./report.js');

export type { }; // module marker (top-level await)

/** The platform's model catalog, minus providers whose API key is not set. */
export const DEFAULT_MODELS: string[] = LLM_MODEL_OPTIONS.filter((m) => {
  const provider = providerForModel(m);
  if (provider === 'openai') return Boolean(env.OPENAI_API_KEY);
  if (provider === 'anthropic') return Boolean(env.ANTHROPIC_API_KEY);
  return Boolean(env.GEMINI_API_KEY);
});

const DATA_DIR = path.join(HERE, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const LOG_SINK = path.join(DATA_DIR, 'llm_calls.jsonl');
const MAX_SPEND_USD = Number(process.env.EVALS_MAX_SPEND_USD ?? '30');

const sinkRows = (): number => (fs.existsSync(LOG_SINK) ? fs.readFileSync(LOG_SINK, 'utf8').split('\n').filter((l) => l.trim() !== '').length : 0);
const sinkRowsAtStart = sinkRows();
let callsMade = 0;

/**
 * generate.ts writes the llm_calls row fire-and-forget (after the pricing
 * fetch); exiting right after the last answer would lose it. Wait until the
 * sink holds one row per call made, or give up after `timeoutMs`.
 */
async function awaitSink(timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (sinkRows() < sinkRowsAtStart + callsMade && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outFile = path.resolve(args.out ?? path.join(HERE, 'results', `run-${stamp}.json`));
fs.mkdirSync(path.dirname(outFile), { recursive: true });

const models = args.models ?? DEFAULT_MODELS;
const stages = args.stages ?? STAGE_NAMES;
for (const s of stages) if (!STAGE_NAMES.includes(s)) throw new Error(`unknown stage "${s}" (known: ${STAGE_NAMES.join(', ')})`);

export interface ResultRow {
  stage: string;
  model: string;
  provider: string;
  caseId: string;
  notes: string | null;
  ranAt: string;
  latencyMs: number;
  attempts: number | null;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  costUsd: number | null;
  error: string | null;
  output: unknown;
  checks: Array<{ key: string; expected: unknown; actual: unknown; pass: boolean }>;
  info: Record<string, unknown> | null;
  pass: boolean;
}

export interface LatencySummary {
  avg: number | null;
  p50: number | null;
  p90: number | null;
  min: number | null;
  max: number | null;
}

export interface ModelSummary {
  total: number;
  passed: number;
  passRate: number | null;
  errors: number;
  latencyMs: LatencySummary;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  costUsd: number | null;
  unpriced: number;
}

export interface RunFile {
  ranAt: string;
  finishedAt: string | null;
  models: string[];
  stages: string[];
  concurrency: number;
  maxSpendUsd: number;
  accountantTimezone: string;
  pricing: Record<string, unknown>;
  results: ResultRow[];
  summary: Record<string, Record<string, ModelSummary>>;
}

const run: RunFile = {
  ranAt: new Date().toISOString(),
  finishedAt: null,
  models,
  stages,
  concurrency: args.concurrency,
  maxSpendUsd: MAX_SPEND_USD,
  accountantTimezone: env.ACCOUNTANT_TIMEZONE,
  pricing: {},
  results: [],
  summary: {},
};

const percentile = (sorted: number[], p: number): number | null =>
  sorted.length === 0 ? null : (sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))] ?? null);

export function summarize(results: ResultRow[]): Record<string, Record<string, ModelSummary>> {
  const acc: Record<string, Record<string, ModelSummary & { latencies: number[] }>> = {};
  for (const r of results) {
    const byModel = (acc[r.stage] ??= {});
    const b = (byModel[r.model] ??= {
      total: 0, passed: 0, passRate: null, errors: 0,
      latencyMs: { avg: null, p50: null, p90: null, min: null, max: null },
      inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0, costUsd: 0, unpriced: 0, latencies: [],
    });
    b.total += 1;
    if (r.pass) b.passed += 1;
    if (r.error) b.errors += 1;
    b.inputTokens += r.inputTokens ?? 0;
    b.outputTokens += r.outputTokens ?? 0;
    b.thinkingTokens += r.thinkingTokens ?? 0;
    b.cachedTokens += r.cachedTokens ?? 0;
    if (r.costUsd === null || r.costUsd === undefined) b.unpriced += 1;
    else b.costUsd = (b.costUsd ?? 0) + r.costUsd;
    if (!r.error) b.latencies.push(r.latencyMs);
  }
  const summary: Record<string, Record<string, ModelSummary>> = {};
  for (const [stage, byModel] of Object.entries(acc)) {
    summary[stage] = {};
    for (const [model, b] of Object.entries(byModel)) {
      const sorted = b.latencies.sort((x, y) => x - y);
      const { latencies: _drop, ...rest } = b;
      summary[stage][model] = {
        ...rest,
        passRate: b.total ? b.passed / b.total : null,
        latencyMs: {
          avg: sorted.length ? Math.round(sorted.reduce((s, x) => s + x, 0) / sorted.length) : null,
          p50: percentile(sorted, 0.5),
          p90: percentile(sorted, 0.9),
          min: sorted[0] ?? null,
          max: sorted.at(-1) ?? null,
        },
        costUsd: b.unpriced === b.total ? null : Number((b.costUsd ?? 0).toFixed(6)),
      };
    }
  }
  return summary;
}

function save(final = false): void {
  run.summary = summarize(run.results);
  if (final) run.finishedAt = new Date().toISOString();
  const json = JSON.stringify(run, null, 2);
  fs.writeFileSync(outFile, json);
  fs.writeFileSync(path.join(path.dirname(outFile), 'latest.json'), json);
}

const spentSoFar = (): number => run.results.reduce((s, r) => s + (r.costUsd ?? 0), 0);

const emptyUsage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0, cachedTokens: 0 };

interface Item {
  stageName: string;
  model: string;
  c: { id: string; notes?: string };
}

async function runCase(loaded: ReturnType<typeof loadStage>, { stageName, model, c }: Item): Promise<ResultRow> {
  const row: ResultRow = {
    stage: stageName, model, provider: providerForModel(model), caseId: c.id, notes: c.notes ?? null, ranAt: new Date().toISOString(),
    latencyMs: 0, attempts: null, ...emptyUsage, costUsd: null, error: null, output: null, checks: [], info: null, pass: false,
  };
  const startedAt = performance.now();
  try {
    const built = loaded.stage.build(c, loaded.ctx);
    callsMade += 1;
    const res = await runLlmCall(built.spec, {
      model,
      log: { userId: null, agentInstanceId: null, clientId: null, sink: { file: LOG_SINK } },
    });
    row.latencyMs = Math.round(performance.now() - startedAt);
    Object.assign(row, res.usage, { attempts: res.attempts });
    const pricing = await getPricingForModel(model);
    row.costUsd = pricing ? computeCost(pricing, res.usage) : null;
    const output = built.parse(res.text);
    row.output = output;
    const { checks, info } = loaded.stage.judge(c, output, loaded.ctx);
    row.checks = checks;
    row.info = info;
    row.pass = checks.every((x) => x.pass);
  } catch (err) {
    row.latencyMs = Math.round(performance.now() - startedAt);
    row.error = (err instanceof Error ? err.message : String(err)).slice(0, 2000);
    row.pass = false;
  }
  return row;
}

/** An API answer that means "this model id does not exist here" — the rest of the group is failed without calling. */
const MODEL_UNAVAILABLE = /not found|does not exist|invalid model|not_found|unsupported model|unknown model|is not supported|no such model/i;

function consoleLine(row: ResultRow): string {
  const failed = row.checks.filter((x) => !x.pass).map((x) => x.key);
  return `[evals] ${row.stage} ${row.model} ${row.caseId} ${row.error ? 'ERROR' : row.pass ? 'PASS' : 'FAIL'} ${row.latencyMs}ms in=${row.inputTokens} out=${row.outputTokens} think=${row.thinkingTokens}${row.costUsd == null ? '' : ` $${row.costUsd.toFixed(5)}`}${failed.length ? ` failed: ${failed.join(', ')}` : ''}${row.error ? ` ${row.error.slice(0, 160)}` : ''}`;
}

async function runGroup(loaded: ReturnType<typeof loadStage>, stageName: string, model: string, items: Item[], concurrency: number): Promise<void> {
  const queue = [...items];
  let unavailable: string | null = null;
  const skipped = (item: Item, error: string): ResultRow => ({
    stage: stageName, model, provider: providerForModel(model), caseId: item.c.id, notes: item.c.notes ?? null, ranAt: new Date().toISOString(),
    latencyMs: 0, attempts: null, ...emptyUsage, costUsd: null, error, output: null, checks: [], info: null, pass: false,
  });
  const worker = async (): Promise<void> => {
    while (queue.length > 0) {
      const item = queue.shift()!;
      let row: ResultRow;
      if (unavailable) row = skipped(item, unavailable);
      else if (spentSoFar() >= MAX_SPEND_USD) row = skipped(item, `spend cap reached: $${spentSoFar().toFixed(4)} >= EVALS_MAX_SPEND_USD ${MAX_SPEND_USD}`);
      else {
        row = await runCase(loaded, item);
        if (row.error && MODEL_UNAVAILABLE.test(row.error) && /model/i.test(row.error)) unavailable = `model unavailable: ${row.error.slice(0, 300)}`;
      }
      run.results.push(row);
      save();
      console.log(consoleLine(row));
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));
}

console.log(`[evals] ${stages.length} stage(s) x ${models.length} model(s), concurrency ${args.concurrency}, spend cap $${MAX_SPEND_USD} -> ${outFile}`);
for (const stageName of stages) {
  const loaded = loadStage(stageName);
  const selected = args.cases ? loaded.cases.filter((c) => args.cases!.includes(c.id)) : loaded.cases;
  if (selected.length === 0) continue;
  for (const model of models) {
    console.log(`[evals] --- ${stageName} / ${model}: ${selected.length} case(s)`);
    await runGroup(loaded, stageName, model, selected.map((c) => ({ stageName, model, c })), args.concurrency);
  }
}
for (const m of models) run.pricing[m] = await getPricingForModel(m);
save(true);

const totalCost = spentSoFar();
console.log(`\n[evals] done: ${run.results.length} calls, ${run.results.filter((r) => r.pass).length} passed, ${run.results.filter((r) => r.error).length} errors, ~$${totalCost.toFixed(4)} (priced models only)`);
for (const [stageName, byModel] of Object.entries(run.summary)) {
  console.log(`\n${stageName}`);
  for (const [model, b] of Object.entries(byModel)) {
    const l = b.latencyMs;
    console.log(
      `  ${model.padEnd(24)} ${String(b.passed).padStart(2)}/${b.total}  avg ${String(l.avg ?? '-').padStart(6)}ms p50 ${String(l.p50 ?? '-').padStart(6)}ms p90 ${String(l.p90 ?? '-').padStart(6)}ms min ${String(l.min ?? '-').padStart(6)}ms max ${String(l.max ?? '-').padStart(6)}ms  in ${String(b.inputTokens).padStart(7)}  out ${String(b.outputTokens).padStart(6)}  think ${String(b.thinkingTokens).padStart(6)}  ${b.costUsd == null ? 'cost n/a' : `$${b.costUsd.toFixed(4)}`}${b.errors ? `  errors ${b.errors}` : ''}`,
    );
  }
}
const reportFile = await buildReport(outFile, path.join(path.dirname(outFile), 'report.html'));
console.log(`\n[evals] results: ${outFile}\n[evals] report:  ${reportFile}`);
await awaitSink(10_000);
console.log(`[evals] llm log: ${LOG_SINK} (+${sinkRows() - sinkRowsAtStart} rows)`);
process.exit(0);
