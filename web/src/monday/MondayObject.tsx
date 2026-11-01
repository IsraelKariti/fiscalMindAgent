import { useEffect, useState } from 'react';
import { ViewerProvider } from '../agents/ApiContext';
import type { Me } from '../api';
import { Workspace } from '../components/Workspace';
import { useT } from '../i18n';
import { mondayApi } from './api';
import { SessionGate, useMondaySession } from './useMondaySession';

/**
 * The custom-object surface: the full accountant workspace inside monday.
 * Identity rides monday sessionTokens (the api transport is configured in
 * objectMain.tsx), so there is no login and no logout — closing the tab is
 * leaving. Admin views live in the standalone app only.
 */
export function MondayObject() {
  const { t } = useT();
  const { phase, boot, openLinkPopup } = useMondaySession();
  const [me, setMe] = useState<Me | null>(null);
  const [meFailed, setMeFailed] = useState(false);

  const ready = phase.kind === 'ready';
  useEffect(() => {
    if (!ready) return;
    mondayApi
      .me()
      .then(setMe)
      .catch(() => setMeFailed(true));
  }, [ready]);

  if (phase.kind !== 'ready') {
    return <SessionGate phase={phase} onRetry={boot} onLink={openLinkPopup} shellClass="ma-shell" />;
  }

  if (meFailed) {
    return (
      <div className="ma-shell screen-center">
        <div className="ma-message">
          <p className="muted">{t.mwSetupFailed}</p>
          <button
            className="btn btn-ghost"
            onClick={() => {
              setMeFailed(false);
              boot();
            }}
          >
            {t.mwRefresh}
          </button>
        </div>
      </div>
    );
  }

  if (!me) return <div className="ma-shell screen-center muted">{t.loading}</div>;

  // A staff viewer (openspec `accountant-staff-access`) sees the accountant's
  // workspace read-only, exactly as in the standalone shell (App.tsx): the
  // notice names the accountant and every write control is hidden. Admins
  // never use the object, so isAdmin stays false.
  const viewingFor = me.viewingFor ?? null;
  return (
    <ViewerProvider value={{ isAdmin: false, readOnly: viewingFor != null }}>
      <Workspace
        userEmail={me.user?.email ?? null}
        viewer={viewingFor}
        // Unpinned: the object shows the same shell as the standalone app
        // (agents-home grid + sidebar switcher when the account has several
        // agents; auto-enter when it has one).
      />
    </ViewerProvider>
  );
}
