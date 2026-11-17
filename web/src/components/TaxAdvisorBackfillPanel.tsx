import { useState } from 'react';
import { ApiError, type TaxAdvisorBackfillResult } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { useT } from '../i18n';
import { SettingsGroup } from './SettingsUI';

/**
 * The admin-only "re-read tax advisors" action (openspec `client-tax-advisor`,
 * change `backfill-tax-advisor`), rendered under the test-client form on the
 * Settings view's admin-only tab. One press posts to the agent's
 * `/clients/tax-advisor-backfill` (view-as only) and shows the counts it
 * answers with; a refusal shows its reason inline.
 */
export function TaxAdvisorBackfillPanel() {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<TaxAdvisorBackfillResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await api.backfillTaxAdvisors());
    } catch (err) {
      setResult(null);
      if (err instanceof ApiError && err.status === 409) setError(t.taxAdvisorBackfillNoMonday);
      else setError(err instanceof ApiError ? err.message : t.taxAdvisorBackfillFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="tax-advisor-backfill">
      <SettingsGroup title={t.taxAdvisorBackfillTitle}>
        <p className="muted">{t.taxAdvisorBackfillLead}</p>
        <div className="btn-row">
          <button className="btn" type="button" disabled={busy} onClick={() => void run()}>
            {busy ? t.taxAdvisorBackfillRunning : t.taxAdvisorBackfillRun}
          </button>
        </div>
        {error && <div className="error-banner">{error}</div>}
        {result && (
          <ul className="tax-advisor-backfill-counts">
            <li>
              <strong>{result.updated}</strong>
              {t.taxAdvisorBackfillUpdated}
            </li>
            <li>
              <strong>{result.cleared}</strong>
              {t.taxAdvisorBackfillCleared}
            </li>
            <li>
              <strong>{result.unchanged}</strong>
              {t.taxAdvisorBackfillUnchanged}
            </li>
            <li>
              <strong>{result.skipped}</strong>
              {t.taxAdvisorBackfillSkipped}
            </li>
            <li>
              <strong>{result.failed}</strong>
              {t.taxAdvisorBackfillFailedCount}
            </li>
          </ul>
        )}
      </SettingsGroup>
    </div>
  );
}
