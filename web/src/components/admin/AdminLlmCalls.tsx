import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  api,
  type Accountant,
  type AdminClient,
  type LlmCallDetail,
  type LlmCallSummary,
} from '../../api';
import { displayClientName, formatTimestamp, formatUsd, LOCALE } from '../../format';
import { useT } from '../../i18n';
import { Dropdown } from '../Dropdown';
import { MODEL_LABELS } from './shared';

const PAGE_SIZE = 50;

function tokensCell(c: LlmCallSummary): string {
  const f = (n: number) => n.toLocaleString(LOCALE);
  return `${f(c.inputTokens)} / ${f(c.outputTokens)} / ${f(c.thinkingTokens)} / ${f(c.cachedTokens)}`;
}

/** USD per 1M tokens, from the stored per-single-token rate. */
function perMillion(rate: number | null): string {
  return rate === null ? '—' : `$${(rate * 1_000_000).toFixed(3)}`;
}

function CallDetailModal({ callId, onClose }: { callId: string; onClose: () => void }) {
  const { t } = useT();
  const [call, setCall] = useState<LlmCallDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminGetLlmCall(callId)
      .then(({ call: c }) => setCall(c))
      .catch(() => setError(t.adminLlmCallLoadFailed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callId]);

  const preStyle = {
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    maxHeight: 320,
    overflowY: 'auto' as const,
    textAlign: 'right' as const,
  };
  const schema = call?.request?.config?.['responseJsonSchema'];
  const contents = call?.request?.contents;

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card modal"
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(860px, 94vw)', maxHeight: '88vh', overflowY: 'auto' }}
      >
        <h2>{t.adminLlmCallTitle}</h2>
        {error && <div className="error-banner">{error}</div>}
        {!call && !error && <p className="muted">{t.loading}</p>}
        {call && (
          <>
            <p className="muted">
              {formatTimestamp(call.createdAt)}
              {' · '}
              {MODEL_LABELS[call.model] ?? call.model}
              {' · '}
              {t.llmPurposeLabels[call.purpose] ?? call.purpose}
              {call.clientName ? ` · ${displayClientName(call.clientName)}` : ''}
            </p>
            <p className="muted" dir="ltr" style={{ textAlign: 'right' }}>
              {t.inputTokens}: {call.inputTokens.toLocaleString(LOCALE)}
              {' · '}
              {t.outputTokens}: {call.outputTokens.toLocaleString(LOCALE)}
              {' · '}
              {t.thinkingTokens}: {call.thinkingTokens.toLocaleString(LOCALE)}
              {' · '}
              {t.cachedTokens}: {call.cachedTokens.toLocaleString(LOCALE)}
              {' · '}
              {t.totalCost}: {call.cost !== null ? formatUsd(call.cost) : '—'}
              {' · '}
              {t.adminLlmCallMetaAttempts}: {call.attempts}
              {call.durationMs !== null ? ` · ${(call.durationMs / 1000).toFixed(1)}s` : ''}
            </p>
            <p className="muted" dir="ltr" style={{ textAlign: 'right' }}>
              {t.adminLlmCallPricesTitle}: {t.inputTokens} {perMillion(call.inputPricePerToken)}
              {' · '}
              {t.outputTokens} {perMillion(call.outputPricePerToken)}
              {' · '}
              {t.thinkingTokens} {perMillion(call.thinkingPricePerToken)}
              {' · '}
              {t.cachedTokens} {perMillion(call.cachedPricePerToken)}
            </p>
            {call.error && (
              <div className="error-banner" dir="ltr">
                {t.adminLlmCallErrorLabel}: {call.error}
              </div>
            )}

            {call.request?.systemInstruction && (
              <>
                <h3>{t.adminLlmCallSystemInstruction}</h3>
                <pre className="wa-number-display" dir="auto" style={preStyle}>
                  {call.request.systemInstruction}
                </pre>
              </>
            )}

            <h3>{t.adminLlmCallContents}</h3>
            <pre className="wa-number-display" dir="auto" style={preStyle}>
              {typeof contents === 'string' ? contents : JSON.stringify(contents, null, 2)}
            </pre>

            {schema !== undefined && (
              <details>
                <summary className="muted">{t.adminLlmCallSchema}</summary>
                <pre className="wa-number-display" dir="ltr" style={{ ...preStyle, textAlign: 'left' }}>
                  {JSON.stringify(schema, null, 2)}
                </pre>
              </details>
            )}

            <h3>{t.adminLlmCallResponse}</h3>
            {call.response === null ? (
              <p className="muted">{t.adminLlmCallNoResponse}</p>
            ) : (
              <pre className="wa-number-display" dir="auto" style={preStyle}>
                {call.response}
              </pre>
            )}
          </>
        )}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The per-call LLM log (#/llm-calls): every call's tokens, call-time cost and
 * status, filterable by agent / client / purpose, with a drill-down into the
 * exact input the model saw — the debugging surface for prompt work.
 */
export function AdminLlmCalls({ accountants }: { accountants: Accountant[] }) {
  const { t } = useT();
  const [instanceFilter, setInstanceFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [purposeFilter, setPurposeFilter] = useState('all');
  const [calls, setCalls] = useState<LlmCallSummary[] | null>(null);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [instanceClients, setInstanceClients] = useState<AdminClient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null);

  const instanceOptions = useMemo(() => {
    const options = [{ value: 'all', label: t.adminLlmCallsFilterAll }];
    for (const a of accountants) {
      for (const agent of a.agents) {
        options.push({ value: agent.id, label: `${agent.name ?? agent.agentType} — ${a.name ?? a.email}` });
      }
    }
    return options;
  }, [accountants, t]);

  // The client filter is scoped to the picked instance (a platform-wide client list would not scale).
  useEffect(() => {
    setInstanceClients(null);
    setClientFilter('all');
    if (instanceFilter === 'all') return;
    api
      .adminListInstanceClients(instanceFilter)
      .then(({ clients }) => setInstanceClients(clients))
      .catch(() => {});
  }, [instanceFilter]);

  const filters = useCallback(
    (before?: string) => ({
      ...(instanceFilter !== 'all' ? { agentInstanceId: instanceFilter } : {}),
      ...(clientFilter !== 'all' ? { clientId: clientFilter } : {}),
      ...(purposeFilter !== 'all' ? { purpose: purposeFilter } : {}),
      ...(before ? { before } : {}),
      limit: PAGE_SIZE,
    }),
    [instanceFilter, clientFilter, purposeFilter],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setCalls(null);
    api
      .adminListLlmCalls(filters())
      .then((d) => {
        if (cancelled) return;
        setCalls(d.calls);
        setNextBefore(d.nextBefore);
        setError(null);
      })
      .catch(() => {
        if (!cancelled) setError(t.adminLlmCallsLoadFailed);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  const loadMore = async () => {
    if (!nextBefore) return;
    setLoading(true);
    try {
      const d = await api.adminListLlmCalls(filters(nextBefore));
      setCalls((prev) => [...(prev ?? []), ...d.calls]);
      setNextBefore(d.nextBefore);
    } catch {
      setError(t.adminLlmCallsLoadFailed);
    } finally {
      setLoading(false);
    }
  };

  const purposeOptions = [
    { value: 'all', label: t.adminLlmCallsFilterAll },
    ...Object.entries(t.llmPurposeLabels).map(([value, label]) => ({ value, label })),
  ];
  const clientOptions = [
    { value: 'all', label: t.adminLlmCallsFilterAll },
    ...(instanceClients ?? []).map((c) => ({ value: c.id, label: displayClientName(c.name) })),
  ];

  return (
    <>
      <section className="card">
        <h2>{t.adminLlmCallsTitle}</h2>
        <p className="muted">{t.adminLlmCallsLead}</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row" style={{ flexWrap: 'wrap', gap: 12 }}>
          <label className="muted">
            {t.adminLlmCallsFilterAgent}{' '}
            <span className="tax-year-dropdown" style={{ minWidth: 220 }}>
              <Dropdown value={instanceFilter} options={instanceOptions} onChange={setInstanceFilter} />
            </span>
          </label>
          {instanceFilter !== 'all' && (
            <label className="muted">
              {t.adminLlmCallsFilterClient}{' '}
              <span className="tax-year-dropdown" style={{ minWidth: 180 }}>
                <Dropdown value={clientFilter} options={clientOptions} onChange={setClientFilter} />
              </span>
            </label>
          )}
          <label className="muted">
            {t.adminLlmCallsFilterPurpose}{' '}
            <span className="tax-year-dropdown" style={{ minWidth: 160 }}>
              <Dropdown value={purposeFilter} options={purposeOptions} onChange={setPurposeFilter} />
            </span>
          </label>
        </div>
      </section>

      <section className="card">
        {calls === null && !error && <p className="muted">{t.loading}</p>}
        {calls !== null && calls.length === 0 && <p className="muted">{t.adminLlmCallsEmpty}</p>}
        {calls !== null && calls.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t.adminLlmCallsColWhen}</th>
                  <th>{t.adminLlmCallsColClient}</th>
                  <th>{t.adminLlmCallsColPurpose}</th>
                  <th>{t.adminLlmCallsColModel}</th>
                  <th>{t.adminLlmCallsColTokens}</th>
                  <th>{t.adminLlmCallsColCost}</th>
                  <th>{t.adminLlmCallsColDuration}</th>
                </tr>
              </thead>
              <tbody>
                {calls.map((c) => (
                  <tr key={c.id} onClick={() => setViewing(c.id)} style={{ cursor: 'pointer' }}>
                    <td dir="ltr">{formatTimestamp(c.createdAt)}</td>
                    <td className="admin-table-name">{c.clientName ? displayClientName(c.clientName) : '—'}</td>
                    <td>
                      {t.llmPurposeLabels[c.purpose] ?? c.purpose}
                      {c.status === 'error' && <span className="badge badge-danger">{t.adminLlmCallsStatusError}</span>}
                    </td>
                    <td>{MODEL_LABELS[c.model] ?? c.model}</td>
                    <td dir="ltr">{tokensCell(c)}</td>
                    <td dir="ltr">{c.cost !== null ? formatUsd(c.cost) : '—'}</td>
                    <td dir="ltr">{c.durationMs !== null ? `${(c.durationMs / 1000).toFixed(1)}s` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {nextBefore && (
          <div className="btn-row">
            <button className="btn btn-ghost btn-small" disabled={loading} onClick={() => void loadMore()}>
              {t.adminLlmCallsLoadMore}
            </button>
          </div>
        )}
      </section>

      {viewing && <CallDetailModal callId={viewing} onClose={() => setViewing(null)} />}
    </>
  );
}
