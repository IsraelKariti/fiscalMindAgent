import { useCallback, useEffect, useState } from 'react';
import type { DashboardSummary } from '../api';
import { NeedsAttentionCard, StatRow } from '../components/overviewParts';
import { useT } from '../i18n';
import { mondayApi } from './api';
import { SessionGate, useMondaySession } from './useMondaySession';

/**
 * The dashboard-widget shell: a glanceable dashboard. Session bootstrap is
 * shared with the custom object (useMondaySession).
 */
export function MondayWidget() {
  const { t } = useT();
  const { phase, boot, openLinkPopup } = useMondaySession();
  const [dash, setDash] = useState<DashboardSummary | null>(null);

  const loadDashboard = useCallback(async () => {
    try {
      setDash(await mondayApi.dashboard());
    } catch {
      // Keep whatever is on screen; the next poll retries.
    }
  }, []);

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
  // Opens the standalone app already signed in: the tab is opened synchronously
  // (popup blockers distrust window.open after an await) and then pointed at a
  // single-use handoff URL that sets the session cookie — monday-only accounts
  // have no Google login to pass otherwise. Falls back to the bare app URL.
  const openApp = async () => {
    const win = window.open('about:blank', '_blank');
    let url = status.appUrl;
    try {
      url = (await mondayApi.appLoginUrl()).url;
    } catch {
      // Bare URL still works for accounts with a linked Google login.
    }
    if (win) win.location.href = url;
    else window.open(url, '_blank');
  };

  return (
    <div className="mw-shell">
      <header className="mw-header">
        <h1>FiscalMind</h1>
        <div className="btn-row">
          <button className="btn btn-ghost" onClick={openApp}>
            {t.mwOpenApp}
          </button>
        </div>
      </header>

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
