import { useMemo } from 'react';
import type { Accountant } from '../../api';
import { useT } from '../../i18n';

/** Platform-wide stat tiles — the admin's landing screen. */
export function AdminOverview({ accountants }: { accountants: Accountant[] }) {
  const { t } = useT();

  const totals = useMemo(
    () =>
      accountants.reduce(
        (acc, a) => ({
          clients: acc.clients + a.clientCount,
          clientsComplete: acc.clientsComplete + a.clientsComplete,
          docs: acc.docs + a.docsTotal,
          docsCollected: acc.docsCollected + a.docsCollected,
        }),
        { clients: 0, clientsComplete: 0, docs: 0, docsCollected: 0 },
      ),
    [accountants],
  );

  return (
    <div className="stat-row">
      <div className="card stat-tile">
        <span className="stat-label">{t.accountantsLabel}</span>
        <span className="stat-value">{accountants.length}</span>
        <span className="stat-context">{t.withAgentMailbox(accountants.filter((a) => a.mailbox).length)}</span>
      </div>
      <div className="card stat-tile">
        <span className="stat-label">{t.clientsLabel}</span>
        <span className="stat-value">{totals.clients}</span>
        <span className="stat-context">{t.acrossAllAccountants}</span>
      </div>
      <div className="card stat-tile">
        <span className="stat-label">{t.clientsCompleteLabel}</span>
        <span className="stat-value">
          {totals.clients === 0 ? '—' : `${totals.clientsComplete} / ${totals.clients}`}
        </span>
        <span className="stat-context">
          {totals.clients === 0 ? t.sidebarNoClients : t.stillInProgress(totals.clients - totals.clientsComplete)}
        </span>
      </div>
      <div className="card stat-tile">
        <span className="stat-label">{t.docsCollectedLabel}</span>
        <span className="stat-value">{totals.docs === 0 ? '—' : `${totals.docsCollected} / ${totals.docs}`}</span>
        {totals.docs > 0 && (
          <div className="stat-meter">
            <div
              className={`stat-meter-fill ${totals.docsCollected === totals.docs ? 'complete' : ''}`}
              style={{ width: `${(totals.docsCollected / totals.docs) * 100}%` }}
            />
          </div>
        )}
        <span className="stat-context">
          {totals.docs === 0 ? t.noDocsRequestedYet : t.nMissing(totals.docs - totals.docsCollected)}
        </span>
      </div>
    </div>
  );
}
