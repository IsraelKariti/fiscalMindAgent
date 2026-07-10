import { useCallback, useEffect, useState } from 'react';
import type { DashboardSummary } from '../api';
import { NeedsAttentionCard, StatRow } from '../components/overviewParts';
import { useT } from '../i18n';
import { mondayApi } from './api';
import { ImportPanel } from './ImportPanel';
import { listenContext } from './sdk';
import { SessionGate, useMondaySession } from './useMondaySession';

/**
 * The dashboard-widget shell: a glanceable dashboard plus the board-import
 * flow. Session bootstrap is shared with the custom object (useMondaySession).
 */
export function MondayWidget() {
  const { t } = useT();
  const { phase, boot, openLinkPopup } = useMondaySession();
  const [dash, setDash] = useState<DashboardSummary | null>(null);
  const [boardIds, setBoardIds] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  const loadDashboard = useCallback(async () => {
    try {
      setDash(await mondayApi.dashboard());
    } catch {
      // Keep whatever is on screen; the next poll retries.
    }
  }, []);

  // Track board connections live — the listener fires immediately with the
  // current context and again on changes (e.g. the user connects a board to
  // the widget after it loaded). monday re-sends the context liberally; keep
  // the array identity stable unless the boards actually changed, or the
  // ImportPanel refetches in a loop.
  useEffect(
    () =>
      listenContext((ctx) => {
        const next = (ctx.boardIds ?? []).map(String);
        setBoardIds((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
      }),
    [],
  );

  // First dashboard load once the session is ready, then keep the numbers
  // current: refresh on focus and with the same 30s cadence as the standalone
  // Overview.
  const ready = phase.kind === 'ready';
  useEffect(() => {
    if (!ready) return;
    loadDashboard();
    const onFocus = () => loadDashboard();
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadDashboard();
    }, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [ready, loadDashboard]);

  if (phase.kind !== 'ready') {
    return <SessionGate phase={phase} onRetry={boot} onLink={openLinkPopup} shellClass="mw-shell" />;
  }

  const { status } = phase;
  const openApp = () => window.open(status.appUrl, '_blank');

  return (
    <div className="mw-shell">
      <header className="mw-header">
        <h1>FiscalMind</h1>
        <div className="btn-row">
          <button
            className="btn btn-ghost mw-import-toggle"
            aria-expanded={importOpen}
            onClick={() => setImportOpen((v) => !v)}
          >
            {importOpen ? t.mwImportClose : t.mwImportOpen}
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="chevron"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
          <button className="btn btn-ghost" onClick={openApp}>
            {t.mwOpenApp}
          </button>
        </div>
      </header>

      {!status.mailboxClaimed && <div className="error-banner">{t.mwMailboxNeeded}</div>}

      {importOpen && (
        <div className="card mw-import-card">
          <ImportPanel boardIds={boardIds} onImported={loadDashboard} onClose={() => setImportOpen(false)} />
        </div>
      )}

      {dash === null ? (
        <p className="muted">{t.loading}</p>
      ) : dash.clients.length === 0 ? (
        <p className="muted">{t.dashboardFillsUp}</p>
      ) : (
        <>
          <StatRow data={dash} />
          <div className="chart-grid mw-grid">
            <NeedsAttentionCard clients={dash.clients} onSelectClient={openApp} />
          </div>
        </>
      )}
    </div>
  );
}
