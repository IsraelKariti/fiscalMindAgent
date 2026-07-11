import { useEffect, useState } from 'react';
import type { Me } from '../api';
import { Workspace } from '../components/Workspace';
import { useT } from '../i18n';
import { mondayApi } from './api';
import { ImportPanel } from './ImportPanel';
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
        <div className="mw-message">
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

  return (
    <Workspace
      userEmail={me.user?.email ?? null}
      tier={me.tier ?? null}
      contactEmail={me.contactEmail ?? null}
      // The monday surface stays the document collector; other agents live in
      // the standalone app until they get a monday surface of their own.
      pinnedAgentType="doc_collector"
      // A custom object has no board context, so the panel starts from its
      // all-boards fallback (every readable board with an email-capable column).
      renderImportPanel={(props) => <ImportPanel boardIds={[]} {...props} />}
    />
  );
}
