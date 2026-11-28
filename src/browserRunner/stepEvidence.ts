import type { Page } from 'playwright';

/**
 * Step evidence (openspec `fetch-step-evidence`): what the runner records at
 * every provider step so a site the operator can only see through a live
 * client session can be studied afterwards. One item per step: a full-page
 * screenshot, the live DOM of every frame as HTML, a complete MHTML snapshot
 * and a record (url, title, console, error responses, what is missing and
 * why). Capturing never fails the step — every part is best-effort.
 *
 * The collector lives on the runner side only; the worker pulls items over
 * HTTP (server.ts) and stores them (documentFetch/stepEvidence.ts). Keep this file
 * free of worker imports — the runner holds no platform secrets.
 */

export interface ConsoleEntry {
  at: string;
  type: string;
  text: string;
}

export interface ResponseEntry {
  at: string;
  method: string;
  url: string;
  /** HTTP status, or null when the request never got a response (failed). */
  status: number | null;
  /** The browser's failure text for a request that never got a response. */
  failure: string | null;
}

export type EvidencePart = 'screenshot' | 'html' | 'mhtml';

/** The route the session's browser leaves through (openspec `fetch-egress-proxy`): host:port only, never credentials. */
export type Egress = { mode: 'direct' } | { mode: 'proxy'; host: string };

export interface StepRecord {
  seq: number;
  name: string;
  at: string;
  url: string | null;
  title: string | null;
  /** URL of every frame, main frame first. */
  frames: string[];
  console: ConsoleEntry[];
  responses: ResponseEntry[];
  /** The error text when the item was recorded at the moment of a failure. */
  error: string | null;
  /** Parts that could not be captured, with the reason. */
  missing: Partial<Record<EvidencePart, string>>;
  /** Byte size of each captured part. */
  sizes: Partial<Record<EvidencePart, number>>;
  /** The session's route, on the first record (seq 1) only. */
  egress?: Egress;
}

export interface EvidenceItem {
  record: StepRecord;
  screenshot: Buffer | null;
  html: Buffer | null;
  mhtml: Buffer | null;
}

export interface EvidenceLimits {
  /** Max bytes per part. */
  screenshot: number;
  html: number;
  mhtml: number;
  /** Max bytes of parts held in memory for one session (items not yet pulled). */
  session: number;
  /** Max console / response entries kept per step. */
  entries: number;
}

export const DEFAULT_LIMITS: EvidenceLimits = {
  screenshot: 8 * 1024 * 1024,
  html: 4 * 1024 * 1024,
  mhtml: 24 * 1024 * 1024,
  session: 120 * 1024 * 1024,
  entries: 200,
};

/** How long each capture part may take before it is recorded as missing. */
export const PART_TIMEOUT_MS = 10_000;

export const bytesOf = (item: EvidenceItem): number =>
  (item.screenshot?.length ?? 0) + (item.html?.length ?? 0) + (item.mhtml?.length ?? 0);

/**
 * Per-session buffer: console lines and error responses since the previous
 * step, plus the items recorded and not yet pulled. Pure — no page access —
 * so the buffering and budget rules are unit-tested without a browser.
 */
/** Longest error text kept on a record; Playwright call logs can run to many KB. Matches the worker's schema cap. */
export const MAX_RECORD_ERROR_CHARS = 4_000;

export class StepCollector {
  private seq = 0;
  private consoleBuf: ConsoleEntry[] = [];
  private responseBuf: ResponseEntry[] = [];
  private egress: Egress | null = null;
  readonly items: EvidenceItem[] = [];

  constructor(readonly limits: EvidenceLimits = DEFAULT_LIMITS) {}

  /** The route the session uses; written on the first record only. */
  setEgress(egress: Egress): void {
    this.egress = egress;
  }

  pushConsole(entry: ConsoleEntry): void {
    if (this.consoleBuf.length < this.limits.entries) this.consoleBuf.push(entry);
  }

  pushResponse(entry: ResponseEntry): void {
    if (this.responseBuf.length < this.limits.entries) this.responseBuf.push(entry);
  }

  /** Bytes of every item still held. */
  heldBytes(): number {
    return this.items.reduce((n, item) => n + bytesOf(item), 0);
  }

  /** Starts a record for the next step: takes the buffered console/responses and clears them. */
  nextRecord(name: string, error: string | null = null): StepRecord {
    this.seq += 1;
    if (error !== null && error.length > MAX_RECORD_ERROR_CHARS) error = error.slice(0, MAX_RECORD_ERROR_CHARS);
    const record: StepRecord = {
      seq: this.seq,
      name,
      at: new Date().toISOString(),
      url: null,
      title: null,
      frames: [],
      console: this.consoleBuf,
      responses: this.responseBuf,
      error,
      missing: {},
      sizes: {},
      ...(this.seq === 1 && this.egress ? { egress: this.egress } : {}),
    };
    this.consoleBuf = [];
    this.responseBuf = [];
    return record;
  }

  /** Adds an item, after fitting it into the per-part and per-session budgets. */
  add(item: EvidenceItem): EvidenceItem {
    const fitted = fitWithinBudget(item, this.heldBytes(), this.limits);
    this.items.push(fitted);
    return fitted;
  }

  /** Items with a seq above `after`, in order. */
  listAfter(after: number): EvidenceItem[] {
    return this.items.filter((item) => item.record.seq > after);
  }

  /** Drops items the worker confirmed it stored (seq ≤ `upTo`), freeing memory. */
  release(upTo: number): void {
    let i = 0;
    while (i < this.items.length) {
      if ((this.items[i] as EvidenceItem).record.seq <= upTo) this.items.splice(i, 1);
      else i += 1;
    }
  }

  get(seq: number): EvidenceItem | undefined {
    return this.items.find((item) => item.record.seq === seq);
  }
}

/**
 * Drops parts that exceed their own cap or would push the session over its
 * memory budget, MHTML first (largest, least essential), then HTML, never the
 * screenshot unless it alone is over its cap. Each drop is recorded in
 * `missing`. Pure.
 */
export function fitWithinBudget(item: EvidenceItem, heldBytes: number, limits: EvidenceLimits = DEFAULT_LIMITS): EvidenceItem {
  const out: EvidenceItem = { ...item, record: { ...item.record, missing: { ...item.record.missing }, sizes: { ...item.record.sizes } } };
  const over = (part: EvidencePart, buf: Buffer | null): boolean => buf !== null && buf.length > limits[part];
  for (const part of ['screenshot', 'html', 'mhtml'] as const) {
    if (over(part, out[part])) {
      out.record.missing[part] = `over the ${part} size limit (${(out[part] as Buffer).length} bytes)`;
      out[part] = null;
    }
  }
  for (const part of ['mhtml', 'html'] as const) {
    if (out[part] !== null && heldBytes + bytesOf(out) > limits.session) {
      out.record.missing[part] = 'session evidence memory budget exhausted';
      out[part] = null;
    }
  }
  for (const part of ['screenshot', 'html', 'mhtml'] as const) {
    const buf = out[part];
    if (buf !== null) out.record.sizes[part] = buf.length;
    else delete out.record.sizes[part];
  }
  return out;
}

const errText = (err: unknown): string => (err instanceof Error ? err.message : String(err));

/** Runs one capture part under the part timeout; a failure or timeout becomes a `missing` reason. */
async function part<T>(record: StepRecord, name: EvidencePart, run: () => Promise<T>): Promise<T | null> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${PART_TIMEOUT_MS / 1000}s`)), PART_TIMEOUT_MS);
      }),
    ]);
  } catch (err) {
    record.missing[name] = errText(err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** The live DOM of the main frame and every child frame, each wrapped with its URL, as one HTML document. */
async function framesHtml(page: Page): Promise<string> {
  const frames = page.frames();
  const main = page.mainFrame();
  let html = await main.content();
  const children = frames.filter((f) => f !== main);
  if (children.length === 0) return html;
  const parts: string[] = [];
  for (const frame of children) {
    let body: string;
    try {
      body = await frame.content();
    } catch (err) {
      body = `<!-- frame content unavailable: ${errText(err)} -->`;
    }
    // Comments keep the child documents readable in a text editor; the
    // enclosing <template> keeps them inert when the main document is rendered.
    parts.push(`\n<!-- ==== child frame: ${frame.url()} ==== -->\n<template data-frame-url="${frame.url()}">\n${body}\n</template>\n`);
  }
  html += `\n<!-- ==== ${children.length} child frame(s) captured by the runner ==== -->\n${parts.join('')}`;
  return html;
}

/**
 * Records one step: screenshot, HTML, MHTML and the record, each guarded, and
 * adds the item to the collector. Never throws.
 */
export async function captureStep(page: Page, collector: StepCollector, name: string, error: string | null = null): Promise<EvidenceItem> {
  const record = collector.nextRecord(name, error);
  try {
    record.url = page.url();
  } catch {
    record.url = null;
  }
  try {
    record.frames = page.frames().map((f) => f.url());
  } catch {
    record.frames = [];
  }
  record.title = await Promise.race([page.title().catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2_000))]);

  const screenshot = await part(record, 'screenshot', () => page.screenshot({ fullPage: true, timeout: PART_TIMEOUT_MS }));
  const html = await part(record, 'html', async () => Buffer.from(await framesHtml(page), 'utf8'));
  const mhtml = await part(record, 'mhtml', async () => {
    const cdp = await page.context().newCDPSession(page);
    try {
      const { data } = await cdp.send('Page.captureSnapshot', { format: 'mhtml' });
      return Buffer.from(data, 'utf8');
    } finally {
      await cdp.detach().catch(() => undefined);
    }
  });
  return collector.add({ record, screenshot, html, mhtml });
}

/** Metadata of an item for the runner's list route: the record only (bytes are fetched per part). */
export function itemSummary(item: EvidenceItem): StepRecord {
  return item.record;
}
