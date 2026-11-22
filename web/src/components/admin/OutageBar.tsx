import { useCallback, useEffect, useState } from 'react';
import { api, type LlmOutageState, type OutageProbeOutcome, type ProviderHold } from '../../api';
import { useT } from '../../i18n';
import { formatTimestamp } from '../../format';

/**
 * The provider outage bar (openspec `llm-provider-outage`): shown at the top
 * of every admin page while a model provider (or the daily spend cap) is
 * held — the provider, the reason in plain words, since when, how many
 * clients wait, that nothing is lost, the raw error folded away, and
 * "retry now", which probes the provider at once and shows the result.
 * Polls every 30 s like the review badge, so a hold that the worker clears
 * disappears without a reload. Nothing is rendered while no hold is open.
 */
export function OutageBar() {
  const { t } = useT();
  const [state, setState] = useState<LlmOutageState | null>(null);
  const [probing, setProbing] = useState(false);
  const [outcomes, setOutcomes] = useState<OutageProbeOutcome[] | null>(null);

  const check = useCallback(() => api.adminGetLlmOutage().then(setState).catch(() => {}), []);
  useEffect(() => {
    check();
    const timer = window.setInterval(check, 30_000);
    return () => clearInterval(timer);
  }, [check]);

  const holds = state ? (Object.entries(state.holds) as [string, ProviderHold][]) : [];
  if (holds.length === 0) return null;

  const probe = async () => {
    setProbing(true);
    setOutcomes(null);
    try {
      const result = await api.adminProbeLlmOutage();
      setOutcomes(result.outcomes);
      setState({ holds: result.holds, clientsWaiting: result.clientsWaiting });
    } catch {
      setOutcomes([]);
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="error-banner outage-bar" role="alert">
      {holds.map(([provider, hold]) => (
        <div key={provider} className="outage-bar-row">
          <strong>{t.outageProviderLabels[provider] ?? provider}</strong>
          <span> — {t.outageKindLabels[hold.kind] ?? hold.kind}</span>
          <span> — {t.outageSince(formatTimestamp(hold.since))}</span>
          {hold.lastProbeAt && <span className="muted"> ({t.outageLastProbe(formatTimestamp(hold.lastProbeAt))})</span>}
          <details className="outage-bar-error">
            <summary>{t.outageErrorDetails}</summary>
            <code dir="ltr">{hold.lastError ?? hold.message}</code>
          </details>
        </div>
      ))}
      <div className="outage-bar-row">
        <span>{t.outageClientsWaiting(state?.clientsWaiting ?? 0)}</span>
        <span> · {t.outageNothingLost}</span>
        <button type="button" className="btn btn-small" onClick={probe} disabled={probing}>
          {probing ? t.outageProbing : t.outageRetryNow}
        </button>
        {outcomes && outcomes.length === 0 && <span>{t.outageProbeFailed}</span>}
        {outcomes &&
          outcomes.map((o) => (
            <span key={o.provider}>
              {t.outageProviderLabels[o.provider] ?? o.provider}:{' '}
              {o.result === 'recovered' ? t.outageRecovered(o.recovered.clients) : t.outageStillFailing}
            </span>
          ))}
      </div>
    </div>
  );
}

/** A small red chip next to a held provider's models (settings + stages pages). */
export function HeldProviderChip({ provider, holds }: { provider: string; holds: LlmOutageState['holds'] | null }) {
  const { t } = useT();
  const hold = holds?.[provider] ?? holds?.['budget'];
  if (!hold) return null;
  return (
    <span className="badge badge-danger" title={hold.lastError ?? hold.message}>
      {t.outageHeldChip}: {t.outageKindLabels[hold.kind] ?? hold.kind}
    </span>
  );
}
