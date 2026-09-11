import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type LlmStage } from '../../api';
import { useT } from '../../i18n';
import { CopyButton } from '../CopyButton';
import { MODEL_LABELS } from './shared';

/**
 * The pipeline's LLM stages as the code defines them right now — served from
 * the same constants the call sites use (src/gemini/llmStages.ts), so this
 * page cannot drift from what the app sends. One card per purpose: prompt
 * template(s) with the {{placeholders}} highlighted, the user-turn layout,
 * the response schema as a field table, the resolved model and the code
 * gate that checks the answer.
 */

/** Wraps every {{placeholder}} in a <mark> so the per-call slots stand out. */
function highlightPlaceholders(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\{\{[a-z_]+\}\}/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <mark key={i++} className="llm-placeholder">
        {m[0]}
      </mark>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

interface SchemaRow {
  path: string;
  type: string;
  required: boolean;
  description: string;
}

/** Strips the `null` branch of a nullable so the type column reads "string" not "string | null" twice. */
function withoutNull(schema: Record<string, unknown>): { schema: Record<string, unknown>; nullable: boolean } {
  const anyOf = schema['anyOf'] as Record<string, unknown>[] | undefined;
  if (Array.isArray(anyOf)) {
    const nonNull = anyOf.filter((s) => s['type'] !== 'null');
    if (nonNull.length !== anyOf.length && nonNull.length === 1) return { schema: nonNull[0]!, nullable: true };
  }
  const type = schema['type'];
  if (Array.isArray(type) && type.includes('null')) {
    return { schema: { ...schema, type: type.filter((t) => t !== 'null').join(' | ') }, nullable: true };
  }
  return { schema, nullable: false };
}

function typeOf(schema: Record<string, unknown>): string {
  const { schema: s, nullable } = withoutNull(schema);
  const suffix = nullable ? ' | null' : '';
  if (Array.isArray(s['enum'])) return `${(s['enum'] as unknown[]).map((v) => JSON.stringify(v)).join(' | ')}${suffix}`;
  if (s['type'] === 'array') {
    const items = (s['items'] as Record<string, unknown> | undefined) ?? {};
    return `${items['type'] === 'object' ? 'object' : typeOf(items)}[]${suffix}`;
  }
  if (typeof s['type'] === 'string') return `${s['type']}${suffix}`;
  return `${JSON.stringify(s['type'] ?? 'any')}${suffix}`;
}

/** Flattens a JSON schema into (path, type, required, description) rows; nested objects and array items indent by path. */
function schemaRows(schema: Record<string, unknown>, prefix = ''): SchemaRow[] {
  const { schema: s } = withoutNull(schema);
  const rows: SchemaRow[] = [];
  const props = s['properties'] as Record<string, Record<string, unknown>> | undefined;
  const required = new Set((s['required'] as string[] | undefined) ?? []);
  if (props) {
    for (const [name, prop] of Object.entries(props)) {
      const path = prefix ? `${prefix}.${name}` : name;
      rows.push({ path, type: typeOf(prop), required: required.has(name), description: String(prop['description'] ?? '') });
      const inner = withoutNull(prop).schema;
      if (inner['type'] === 'object' && inner['properties']) rows.push(...schemaRows(inner, path));
      if (inner['type'] === 'array') {
        const items = (inner['items'] as Record<string, unknown> | undefined) ?? {};
        if (withoutNull(items).schema['properties']) rows.push(...schemaRows(items, `${path}[]`));
      }
    }
  }
  return rows;
}

function Pane({ children, tone, ltr }: { children: ReactNode; tone: string; ltr?: boolean }) {
  return (
    <pre className={`llm-pane llm-pane-${tone}`} dir={ltr ? 'ltr' : 'auto'} style={{ textAlign: ltr ? 'left' : 'right' }}>
      {children}
    </pre>
  );
}

function StageCard({ stage, onViewCalls }: { stage: LlmStage; onViewCalls: () => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(false);
  const [rawSchema, setRawSchema] = useState(false);
  const rows = useMemo(() => schemaRows(stage.schema), [stage.schema]);
  return (
    <section className="card llm-stage-card">
      <header className="llm-stage-head" onClick={() => setOpen((o) => !o)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && setOpen((o) => !o)}>
        <div>
          <h3 style={{ margin: 0 }}>{stage.title}</h3>
          <div className="muted mono" dir="ltr" style={{ textAlign: 'left' }}>
            {stage.purpose} · {t.llmStageGate}: {stage.gate}
          </div>
        </div>
        <div className="llm-stage-meta" dir="ltr">
          <span className="badge badge-neutral">
            {t.llmStageModel}: {MODEL_LABELS[stage.model] ?? stage.model} ({stage.provider})
          </span>
          <span className="badge badge-neutral">
            {t.llmStageTemperature}: {stage.temperature}
          </span>
        </div>
      </header>
      {open && (
        <div className="llm-stage-body">
          <p className="muted mono" dir="ltr" style={{ textAlign: 'left' }}>
            {t.llmStageFile}: {stage.file}
          </p>
          {stage.placeholders.length > 0 && (
            <p className="muted" dir="ltr" style={{ textAlign: 'left' }}>
              {t.llmStagePlaceholders}:{' '}
              {stage.placeholders.map((p) => (
                <mark key={p} className="llm-placeholder" style={{ marginInlineEnd: 6 }}>
                  {`{{${p}}}`}
                </mark>
              ))}
            </p>
          )}
          {stage.prompts.map((p) => (
            <div key={p.variant} className="llm-pane-wrap llm-pane-copy-left">
              <div className="llm-stage-label">
                {t.llmStageSystemPrompt}
                {stage.prompts.length > 1 && <span className="muted"> · {p.variant}</span>}
              </div>
              <CopyButton text={p.systemPrompt} title={t.copyText} />
              <Pane tone="system">{highlightPlaceholders(p.systemPrompt)}</Pane>
            </div>
          ))}
          {stage.query.map((q) => (
            <div key={q.variant} className="llm-pane-wrap llm-pane-copy-left">
              <div className="llm-stage-label">
                {t.llmStageQuery}
                {stage.query.length > 1 && <span className="muted"> · {q.variant}</span>}
              </div>
              <Pane tone="input" ltr>
                {q.parts.map((part, i) => (
                  <div key={i} className={part.kind === 'binary' ? 'llm-binary-part' : undefined}>
                    {part.kind === 'binary' ? `[${t.llmStageBinaryPart}: ${part.body}]` : highlightPlaceholders(part.body)}
                  </div>
                ))}
              </Pane>
            </div>
          ))}
          <div className="llm-stage-label">
            {t.llmStageSchema}
            <button type="button" className="btn btn-link" onClick={() => setRawSchema((r) => !r)} style={{ marginInlineStart: 8 }}>
              {t.llmStageRawSchema}
            </button>
          </div>
          {rawSchema ? (
            <div className="llm-pane-wrap llm-pane-copy-right">
              <CopyButton text={JSON.stringify(stage.schema, null, 2)} title={t.copyText} />
              <Pane tone="schema" ltr>
                {JSON.stringify(stage.schema, null, 2)}
              </Pane>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table" dir="ltr" style={{ textAlign: 'left' }}>
                <thead>
                  <tr>
                    <th>{t.llmStageSchemaField}</th>
                    <th>{t.llmStageSchemaType}</th>
                    <th>{t.llmStageSchemaRequired}</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.path}>
                      <td className="mono" style={{ paddingInlineStart: 8 + 14 * (r.path.split('.').length - 1) }}>
                        {r.path}
                      </td>
                      <td className="mono">{r.type}</td>
                      <td>{r.required ? '✓' : ''}</td>
                      <td className="muted" dir="auto">
                        {r.description}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <button type="button" className="btn" onClick={onViewCalls}>
              {t.llmStageViewCalls}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

export function AdminLlmStages({ onViewCalls }: { onViewCalls: () => void }) {
  const { t } = useT();
  const [stages, setStages] = useState<LlmStage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminListLlmStages()
      .then(({ stages: s }) => setStages(s))
      .catch(() => setError(t.llmStagesLoadFailed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="admin-page">
      <h2>{t.llmStagesTitle}</h2>
      <p className="muted">{t.llmStagesDesc}</p>
      {error && <div className="error-banner">{error}</div>}
      {!stages && !error && <p className="muted">{t.loading}</p>}
      {stages && stages.map((s) => <StageCard key={s.purpose} stage={s} onViewCalls={onViewCalls} />)}
    </div>
  );
}
