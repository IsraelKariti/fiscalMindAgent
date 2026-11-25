import { useEffect, useMemo, useState } from 'react';
import { api, type DocumentCost } from '../api';
import { formatUsd, LOCALE } from '../format';
import { useT } from '../i18n';
import { ChartCard, NEUTRAL, Seg } from './charts/common';
import {
  DOCUMENT_COST_SORTS,
  readStoredFilters,
  sortClients,
  writeStoredFilters,
  type DocumentCostClientKind,
  type DocumentCostFilters,
  type DocumentCostSort,
} from './documentCost';
import { formatPercent } from './messageAnalytics';

/**
 * The admin-only documents tab of the Settings view (openspec
 * `document-cost-analytics`): what the agent's LLM spend bought in settled
 * checklist items — per client and pooled over the instance — so the product
 * can be priced against the value it brings. Lifetime figures from one admin
 * route per filter choice; the filters are remembered in localStorage.
 */
export function DocumentCostTab({ agentInstanceId, onOpenClient }: { agentInstanceId: string; onOpenClient: (clientId: string) => void }) {
  const { t } = useT();
  const [filters, setFilters] = useState<DocumentCostFilters>(readStoredFilters);
  const [data, setData] = useState<DocumentCost | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError(null);
    api
      .adminGetDocumentCost(agentInstanceId, { clients: filters.clients, completed: filters.completed })
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setError(t.documentCostLoadFailed);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentInstanceId, filters.clients, filters.completed]);

  useEffect(() => {
    writeStoredFilters(filters);
  }, [filters]);

  const rows = useMemo(() => (data ? sortClients(data.clients, filters.sort) : []), [data, filters.sort]);

  const plus = (unpriced: number) => (unpriced > 0 ? '+' : '');
  const cost = (value: number, unpriced: number) => `${value === 0 ? '$0' : formatUsd(value)}${plus(unpriced)}`;
  const quotient = (value: number | null, unpriced: number) => (value === null ? '—' : `${formatUsd(value)}${plus(unpriced)}`);
  const count = (n: number) => n.toLocaleString(LOCALE);
  const decimal = (value: number | null) => (value === null ? '—' : value.toLocaleString(LOCALE, { maximumFractionDigits: 1 }));

  const loaded = data !== null;
  const empty = loaded && data.tiles.clients === 0;

  const tiles = loaded && !empty
    ? [
        { label: t.documentCostTileClients, value: count(data.tiles.clients), context: t.documentCostTileClientsContext(data.tiles.completed) },
        { label: t.documentCostTileCost, value: cost(data.tiles.cost, data.tiles.unpriced), context: t.documentCostTileCostContext },
        { label: t.documentCostTileItemsFile, value: count(data.tiles.itemsFile), context: t.documentCostTileItemsFileContext },
        { label: t.documentCostTileItemsForm, value: count(data.tiles.itemsForm), context: t.documentCostTileItemsFormContext },
        { label: t.documentCostTileItemsChat, value: count(data.tiles.itemsChat), context: t.documentCostTileItemsChatContext },
        {
          label: t.documentCostTileItemsAccountant,
          value: count(data.tiles.itemsAccountant),
          context: t.documentCostTileItemsAccountantContext(data.tiles.itemsOpen),
        },
        { label: t.documentCostTileCostPerFile, value: quotient(data.tiles.costPerFile, data.tiles.unpriced), context: t.documentCostTileCostPerFileContext },
        { label: t.documentCostTileCostPerItem, value: quotient(data.tiles.costPerItem, data.tiles.unpriced), context: t.documentCostTileCostPerItemContext },
        { label: t.documentCostTileMedian, value: quotient(data.tiles.medianCostPerItem, data.tiles.unpriced), context: t.documentCostTileMedianContext },
        {
          label: t.documentCostTileCostPerCompleted,
          value: quotient(data.tiles.costPerCompleted, data.tiles.unpriced),
          context: t.documentCostTileCostPerCompletedContext(data.tiles.completed),
        },
        { label: t.documentCostTileFileShare, value: formatPercent(data.tiles.fileShare), context: t.documentCostTileFileShareContext },
        { label: t.documentCostTileMessagesPerItem, value: decimal(data.tiles.messagesPerItem), context: t.documentCostTileMessagesPerItemContext },
        { label: t.documentCostTileDays, value: decimal(data.tiles.medianDaysCompleted), context: t.documentCostTileDaysContext },
      ]
    : [];

  return (
    <div className="cost-graph message-analytics document-cost">
      <div className="usage-toolbar">
        <div className="admin-toolbar usage-toolbar-row">
          <span className="usage-filter-label">{t.documentCostClientsLabel}</span>
          <Seg<DocumentCostClientKind>
            label={t.documentCostClientsLabel}
            value={filters.clients}
            options={[
              { value: 'live', label: t.documentCostClientsLive },
              { value: 'test', label: t.documentCostClientsTest },
              { value: 'all', label: t.documentCostClientsAll },
            ]}
            onChange={(clients) => setFilters((f) => ({ ...f, clients }))}
          />
          <label className="usage-filter document-cost-toggle">
            <input type="checkbox" checked={filters.completed} onChange={(e) => setFilters((f) => ({ ...f, completed: e.target.checked }))} />
            <span>{t.documentCostCompletedOnly}</span>
          </label>
          <label className="usage-filter">
            <span className="usage-filter-label">{t.documentCostSortLabel}</span>
            <select value={filters.sort} onChange={(e) => setFilters((f) => ({ ...f, sort: e.target.value as DocumentCostSort }))}>
              {DOCUMENT_COST_SORTS.map((s) => (
                <option key={s} value={s}>
                  {t.documentCostSort[s]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!error && !loaded && <p className="muted">{t.loading}</p>}
      {empty && <p className="muted cost-empty">{t.documentCostEmpty}</p>}

      {loaded && !empty && (
        <>
          <div className="stat-row document-cost-tiles">
            {tiles.map((tile) => (
              <div key={tile.label} className="card stat-tile">
                <span className="stat-label">{tile.label}</span>
                <span className="stat-value" dir="ltr">
                  {tile.value}
                </span>
                <span className="stat-context">{tile.context}</span>
              </div>
            ))}
          </div>

          <div className="chart-grid">
            <ChartCard title={t.documentCostTableTitle} subtitle={t.documentCostTableSubtitle} span={3}>
              <div className="admin-table-wrap">
                <table className="admin-table document-cost-table">
                  <thead>
                    <tr>
                      <th>{t.documentCostColClient}</th>
                      <th>{t.documentCostColState}</th>
                      <th>{t.documentCostColItemsFile}</th>
                      <th>{t.documentCostColItemsForm}</th>
                      <th>{t.documentCostColItemsChat}</th>
                      <th>{t.documentCostColItemsAccountant}</th>
                      <th>{t.documentCostColItemsOpen}</th>
                      <th>{t.documentCostColSent}</th>
                      <th>{t.documentCostColReceived}</th>
                      <th>{t.documentCostColCost}</th>
                      <th>{t.documentCostColCostPerFile}</th>
                      <th>{t.documentCostColCostPerItem}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((c) => (
                      <tr key={c.clientId}>
                        <td className="admin-table-name">
                          <button type="button" className="link-button document-cost-client" onClick={() => onOpenClient(c.clientId)}>
                            {c.name}
                          </button>
                          {c.test && <span className="admin-chip cost-failed-mark">{t.documentCostTestMark}</span>}
                          {c.deleted && <span className="badge badge-danger cost-failed-mark">{t.documentCostDeletedMark}</span>}
                        </td>
                        <td>{t.documentCostState[c.state] ?? c.state}</td>
                        <td dir="ltr">{count(c.itemsFile)}</td>
                        <td dir="ltr">{count(c.itemsForm)}</td>
                        <td dir="ltr">{count(c.itemsChat)}</td>
                        <td dir="ltr">{count(c.itemsAccountant)}</td>
                        <td dir="ltr">{count(c.itemsOpen)}</td>
                        <td dir="ltr">{count(c.messagesSent)}</td>
                        <td dir="ltr">{count(c.messagesReceived)}</td>
                        <td dir="ltr" style={{ color: c.cost > 0 ? undefined : NEUTRAL }}>
                          {cost(c.cost, c.unpriced)}
                        </td>
                        <td dir="ltr" style={{ color: c.costPerFile === null ? NEUTRAL : undefined }}>
                          {quotient(c.costPerFile, c.unpriced)}
                        </td>
                        <td dir="ltr" style={{ color: c.costPerItem === null ? NEUTRAL : undefined }}>
                          {quotient(c.costPerItem, c.unpriced)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="document-cost-footer">
                      <td className="admin-table-name">{t.documentCostFooter}</td>
                      <td />
                      <td dir="ltr">{count(data.footer.itemsFile)}</td>
                      <td dir="ltr">{count(data.footer.itemsForm)}</td>
                      <td dir="ltr">{count(data.footer.itemsChat)}</td>
                      <td dir="ltr">{count(data.footer.itemsAccountant)}</td>
                      <td dir="ltr">{count(data.footer.itemsOpen)}</td>
                      <td dir="ltr">{count(data.footer.messagesSent)}</td>
                      <td dir="ltr">{count(data.footer.messagesReceived)}</td>
                      <td dir="ltr">{cost(data.footer.cost, data.footer.unpriced)}</td>
                      <td dir="ltr">{quotient(data.footer.costPerFile, data.footer.unpriced)}</td>
                      <td dir="ltr">{quotient(data.footer.costPerItem, data.footer.unpriced)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </ChartCard>
          </div>
          {data.tiles.unpriced > 0 && <p className="muted usage-unpriced-note">{t.documentCostUnpricedNote(data.tiles.unpriced)}</p>}
        </>
      )}
    </div>
  );
}
