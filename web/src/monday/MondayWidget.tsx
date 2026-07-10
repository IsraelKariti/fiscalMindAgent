import { useCallback, useEffect, useState } from 'react';
import type { DashboardSummary } from '../api';
import { NeedsAttentionCard, StatRow } from '../components/overviewParts';
import { useT } from '../i18n';
import { mondayApi, MondayApiError, type MondaySessionStatus } from './api';
import { ImportPanel } from './ImportPanel';
import { getContext, listenContext, mondayGraphQL } from './sdk';

type Phase =
  | { kind: 'loading' }
  | { kind: 'error' }
  /** The monday email already belongs to a Google account — offer the link popup. */
  | { kind: 'link'; email: string }
  /** Provisioned but not whitelisted (e.g. access was revoked). */
  | { kind: 'pending'; email: string }
  | { kind: 'ready'; status: MondaySessionStatus };

/**
 * The dashboard-widget shell. Identity comes from monday (sessionToken), never
 * from a login screen: the first load auto-provisions a fiscalMind account for
 * this monday user, and existing Google-based accounts link via a popup.
 */
export function MondayWidget() {
  const { t } = useT();
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
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

  const applyBoardIds = useCallback((ids: (number | string)[] | undefined) => {
    const next = (ids ?? []).map(String);
    // monday re-sends the context liberally; keep the array identity stable
    // unless the boards actually changed, or the ImportPanel refetches in a loop.
    setBoardIds((prev) => (prev.length === next.length && prev.every((id, i) => id === next[i]) ? prev : next));
  }, []);

  const boot = useCallback(async () => {
    try {
      const ctx = await getContext();
      applyBoardIds(ctx.boardIds);
      const me = (await mondayGraphQL<{ me: { name: string | null; email: string } }>('query { me { name email } }'))
        .me;

      let status: MondaySessionStatus;
      try {
        status = await mondayApi.session(me.email, me.name);
      } catch (err) {
        if (err instanceof MondayApiError && err.code === 'email_in_use') {
          setPhase({ kind: 'link', email: me.email });
          return;
        }
        throw err;
      }

      if (!status.whitelisted) {
        setPhase({ kind: 'pending', email: status.email });
        return;
      }
      setPhase({ kind: 'ready', status });
      await loadDashboard();
    } catch {
      setPhase({ kind: 'error' });
    }
  }, [loadDashboard, applyBoardIds]);

  useEffect(() => {
    boot();
  }, [boot]);

  // Track board connections live: connecting a board to the widget after it
  // loaded updates the context without a reload.
  useEffect(() => listenContext((ctx) => applyBoardIds(ctx.boardIds)), [applyBoardIds]);

  // Refresh when the tab regains focus (e.g. after the Google link popup) and
  // keep the numbers current with the same 30s cadence as the standalone Overview.
  useEffect(() => {
    const onFocus = () => {
      if (phase.kind === 'ready') loadDashboard();
      else if (phase.kind === 'link' || phase.kind === 'error') boot();
    };
    window.addEventListener('focus', onFocus);
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible' && phase.kind === 'ready') loadDashboard();
    }, 30_000);
    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [phase.kind, boot, loadDashboard]);

  const openLinkPopup = useCallback(async () => {
    try {
      const { url } = await mondayApi.linkUrl();
      window.open(url, '_blank', 'popup,width=520,height=680');
    } catch {
      setPhase({ kind: 'error' });
    }
  }, []);

  if (phase.kind === 'loading') return <div className="mw-shell screen-center muted">{t.loading}</div>;

  if (phase.kind === 'error') {
    return (
      <div className="mw-shell screen-center">
        <div className="mw-message">
          <p className="muted">{t.mwSetupFailed}</p>
          <button className="btn btn-ghost" onClick={boot}>
            {t.mwRefresh}
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'link') {
    return (
      <div className="mw-shell screen-center">
        <div className="mw-message">
          <p>{t.mwEmailInUse(phase.email)}</p>
          <button className="btn btn-primary" onClick={openLinkPopup}>
            {t.mwLinkButton}
          </button>
          <p className="muted">{t.mwLinkHint}</p>
        </div>
      </div>
    );
  }

  if (phase.kind === 'pending') {
    return (
      <div className="mw-shell screen-center">
        <div className="mw-message">
          <h2>{t.accessPendingTitle}</h2>
          <p className="muted">
            {t.accessPendingLead} {phase.email}
            {t.accessPendingTail}
          </p>
        </div>
      </div>
    );
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
