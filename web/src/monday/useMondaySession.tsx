import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';
import { mondayApi, MondayApiError, type MondaySessionStatus } from './api';
import { mondayGraphQL } from './sdk';

export type SessionPhase =
  | { kind: 'loading' }
  | { kind: 'error' }
  /** The monday email already belongs to a Google account — offer the link popup. */
  | { kind: 'link'; email: string }
  /** Provisioned but not whitelisted (e.g. access was revoked). */
  | { kind: 'pending'; email: string }
  | { kind: 'ready'; status: MondaySessionStatus };

/**
 * Session bootstrap shared by the monday surfaces (dashboard widget, custom
 * object). Identity comes from monday (sessionToken), never from a login
 * screen: the first load auto-provisions a fiscalMind account for this monday
 * user, and existing Google-based accounts link via a popup. Retries the boot
 * when focus returns to a failed/linking iframe (e.g. after the Google popup).
 */
export function useMondaySession() {
  const [phase, setPhase] = useState<SessionPhase>({ kind: 'loading' });

  const boot = useCallback(async () => {
    try {
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
    } catch {
      setPhase({ kind: 'error' });
    }
  }, []);

  useEffect(() => {
    boot();
  }, [boot]);

  useEffect(() => {
    const onFocus = () => {
      if (phase.kind === 'link' || phase.kind === 'error') boot();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [phase.kind, boot]);

  const openLinkPopup = useCallback(async () => {
    try {
      const { url } = await mondayApi.linkUrl();
      window.open(url, '_blank', 'popup,width=520,height=680');
    } catch {
      setPhase({ kind: 'error' });
    }
  }, []);

  return { phase, boot, openLinkPopup };
}

interface GateProps {
  phase: Exclude<SessionPhase, { kind: 'ready' }>;
  onRetry: () => void;
  onLink: () => void;
  /** Outer shell class of the calling surface ('mw-shell' for the widget). */
  shellClass: string;
}

/** The pre-ready screens (loading / error / link / access pending), shared by both surfaces. */
export function SessionGate({ phase, onRetry, onLink, shellClass }: GateProps) {
  const { t } = useT();

  if (phase.kind === 'loading') return <div className={`${shellClass} screen-center muted`}>{t.loading}</div>;

  if (phase.kind === 'error') {
    return (
      <div className={`${shellClass} screen-center`}>
        <div className="mw-message">
          <p className="muted">{t.mwSetupFailed}</p>
          <button className="btn btn-ghost" onClick={onRetry}>
            {t.mwRefresh}
          </button>
        </div>
      </div>
    );
  }

  if (phase.kind === 'link') {
    return (
      <div className={`${shellClass} screen-center`}>
        <div className="mw-message">
          <p>{t.mwEmailInUse(phase.email)}</p>
          <button className="btn btn-primary" onClick={onLink}>
            {t.mwLinkButton}
          </button>
          <p className="muted">{t.mwLinkHint}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`${shellClass} screen-center`}>
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
