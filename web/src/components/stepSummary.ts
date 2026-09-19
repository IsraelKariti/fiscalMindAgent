/**
 * "What this step did": turns one audit row's detail into labelled rows for
 * the step detail modal. Pure (no React, no i18n) so it is unit-tested from
 * the root test suite; the modal resolves each row's `key` to a Hebrew label.
 *
 * Known actions get a hand-written mapping for their nested structures (the
 * apply_* steps, evidence objects). Every key the mapping did not consume, and
 * every action without a mapping, falls through to the generic renderer so
 * nothing recorded is hidden. `clientName` is always dropped (every row
 * repeats it); `result`, `reason` and `checks` are rendered by the modal
 * header / checks section, never here.
 */

export type SummaryRow = { key: string; value: string } | { key: string; items: string[] };

type Detail = Record<string, unknown>;

const HEADER_KEYS = new Set(['clientName', 'result', 'reason', 'checks']);

const isRecord = (v: unknown): v is Detail => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const strList = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]) : null);

/** A document reference: `name` when recorded, else the id (old rows). */
function docLabel(row: unknown): string {
  if (typeof row === 'string') return row;
  if (!isRecord(row)) return JSON.stringify(row);
  return str(row['name']) ?? str(row['id']) ?? JSON.stringify(row);
}

/** The quote of an evidence object (`{message_id, quote}` / `{source:'form', question, quote}` / `{source:'form_empty', question}`). */
function evidenceText(v: unknown): string | null {
  if (!isRecord(v)) return null;
  const quote = str(v['quote']);
  const question = str(v['question']);
  if (quote && question) return `${question}: "${quote}"`;
  if (quote) return `"${quote}"`;
  if (question) return question;
  return null;
}

function primitiveText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') return v === '' ? null : v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return null;
}

/** Generic rendering of one detail key. */
function genericRow(key: string, v: unknown): SummaryRow | null {
  const text = primitiveText(v);
  if (text !== null) return { key, value: text };
  if (v === null || v === undefined) return null;
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    const list = strList(v);
    return { key, items: list ?? v.map((x) => primitiveText(x) ?? JSON.stringify(x)) };
  }
  if (isRecord(v)) {
    const ev = evidenceText(v);
    return { key, value: ev ?? JSON.stringify(v) };
  }
  return { key, value: String(v) };
}

/** Rows for the keys a mapping consumed; returns the rows and the consumed keys. */
type Mapping = (d: Detail) => { rows: SummaryRow[]; consumed: string[] };

const list = (key: string, items: string[] | null): SummaryRow[] => (items && items.length > 0 ? [{ key, items }] : []);

const MAPPINGS: Record<string, Mapping> = {
  apply_resolutions: (d) => {
    const rows = Array.isArray(d['rows']) ? d['rows'] : [];
    const items = rows.map((r) => {
      if (!isRecord(r)) return docLabel(r);
      const parts = [docLabel(r), str(r['resolution'])].filter((x): x is string => !!x);
      const quote = str(r['quote']);
      const instances = strList(r['instances']);
      let text = parts.join(' — ');
      if (instances && instances.length > 0) text += ` · ${instances.join(', ')}`;
      if (quote) text += ` · "${quote}"`;
      return text;
    });
    return { rows: list('resolved_documents', items), consumed: ['rows', 'count'] };
  },
  apply_additions: (d) => {
    const entries = Array.isArray(d['entries']) ? d['entries'] : [];
    const items = entries.map((e) => {
      if (!isRecord(e)) return JSON.stringify(e);
      const anchor = str(e['anchorName']) ?? str(e['anchorId']) ?? '?';
      const instances = strList(e['instances']) ?? [];
      const quote = str(e['quote']);
      return quote ? `${anchor}: ${instances.join(', ')} · "${quote}"` : `${anchor}: ${instances.join(', ')}`;
    });
    return { rows: list('added_instances', items), consumed: ['entries', 'count'] };
  },
  apply_retirements: (d) => {
    const rows = Array.isArray(d['rows']) ? d['rows'] : [];
    const items = rows.map((r) => {
      const quote = isRecord(r) ? str(r['quote']) : null;
      return quote ? `${docLabel(r)} · "${quote}"` : docLabel(r);
    });
    return { rows: list('retired_documents', items), consumed: ['rows', 'count'] };
  },
  apply_collections: (d) => {
    const pairs = Array.isArray(d['pairs']) ? d['pairs'] : [];
    const pairItems = pairs.map((p) => {
      if (!isRecord(p)) return JSON.stringify(p);
      const file = str(p['fileName']) ?? str(p['fileId']) ?? '?';
      const doc = str(p['documentName']) ?? str(p['documentId']) ?? '?';
      return `${file} → ${doc}`;
    });
    const refused = Array.isArray(d['refused']) ? d['refused'] : [];
    const refusedItems = refused.map((r) => {
      if (!isRecord(r)) return JSON.stringify(r);
      const file = str(r['fileName']) ?? str(r['fileId']) ?? '?';
      const doc = str(r['documentName']) ?? str(r['documentId']) ?? '?';
      return `${file} ↛ ${doc} (${str(r['reason']) ?? '?'})`;
    });
    return {
      rows: [
        ...list('collected', strList(d['collectedNames']) ?? strList(d['collected'])),
        ...list('claimed', strList(d['claimedNames']) ?? strList(d['claimed'])),
        ...list('proposed', strList(d['proposedNames']) ?? strList(d['proposed'])),
        ...list('pairs', pairItems),
        ...list('refused_ties', refusedItems),
      ],
      consumed: ['collected', 'collectedNames', 'claimed', 'claimedNames', 'proposed', 'proposedNames', 'pairs', 'refused'],
    };
  },
  'document.collected': (d) => ({
    rows: list('documents', strList(d['names']) ?? strList(d['documentIds'])),
    consumed: ['names', 'documentIds'],
  }),
  'document.claimed': (d) => ({
    rows: list('documents', strList(d['names']) ?? strList(d['documentIds'])),
    consumed: ['names', 'documentIds'],
  }),
  withhold_reply: (d) => ({
    rows: list('documents', strList(d['names']) ?? strList(d['documentIds'])),
    consumed: ['names', 'documentIds'],
  }),
  'planner.rerun_after_verification': (d) => {
    const documents = Array.isArray(d['documents']) ? d['documents'] : [];
    const items = documents.map((r) => (isRecord(r) ? `${docLabel(r)} — ${str(r['outcome']) ?? '?'}` : docLabel(r)));
    return { rows: list('documents', items), consumed: ['documents'] };
  },
};

/** The labelled rows of one step's detail, mapped keys first, then everything else in recorded order. */
export function stepSummaryOf(action: string, detail: Detail): SummaryRow[] {
  const mapping = MAPPINGS[action];
  const mapped = mapping ? mapping(detail) : { rows: [], consumed: [] };
  const consumed = new Set(mapped.consumed);
  const rest: SummaryRow[] = [];
  for (const [key, value] of Object.entries(detail)) {
    if (HEADER_KEYS.has(key) || consumed.has(key)) continue;
    const row = genericRow(key, value);
    if (row) rest.push(row);
  }
  return [...mapped.rows, ...rest];
}

/** True for an ISO datetime string, so the modal can format it in the viewer's locale. */
export function isIsoDateTime(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value) && !Number.isNaN(Date.parse(value));
}
