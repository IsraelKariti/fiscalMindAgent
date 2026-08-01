import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type AgentTypeEmailInfo, type OrphanedWaNumber } from '../../api';
import { getAgentUI } from '../../agents/registry';
import { useT } from '../../i18n';
import { Dropdown } from '../Dropdown';
import { taxYearOptions } from './shared';

/** Sentinel Dropdown values for the WhatsApp choice — real choices are phone numbers. */
const WA_NONE = '';
const WA_MANUAL = 'manual';

interface Props {
  userId: string;
  /** Agent types the accountant may still get (no instance yet), registry-ordered. */
  addableTypes: string[];
  emailInfoByType: Record<string, AgentTypeEmailInfo>;
  emailDomain: string;
  defaultTaxYear: number;
  /** Called after the agent was created (even if the WhatsApp assignment failed). */
  onAdded: () => Promise<void>;
  onClose: () => void;
}

/**
 * Admin-side agent creation, available from the moment the accountant is
 * activated (before their first sign-in): picks the agent type and collects
 * everything the agent needs to face clients — the mandatory email address
 * and tax year where the type requires them, and optionally a WhatsApp number
 * (from the unassigned Twilio pool or entered manually).
 */
export function AddAgentModal({ userId, addableTypes, emailInfoByType, emailDomain, defaultTaxYear, onAdded, onClose }: Props) {
  const { t } = useT();
  const [agentType, setAgentType] = useState(addableTypes[0] ?? '');
  const [localPart, setLocalPart] = useState('');
  const [taxYear, setTaxYear] = useState(defaultTaxYear);
  const [waChoice, setWaChoice] = useState(WA_NONE);
  const [manualNumber, setManualNumber] = useState('');
  const [orphans, setOrphans] = useState<OrphanedWaNumber[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const typeOptions = useMemo(
    () => addableTypes.map((type) => ({ value: type, label: t[getAgentUI(type).nameKey] })),
    [addableTypes, t],
  );

  const typeInfo = emailInfoByType[agentType] ?? null;
  const emailCapable = Boolean(typeInfo?.emailCapable);
  const taxYearCapable = Boolean(typeInfo?.taxYearCapable);
  const suggestedLocalPart = typeInfo?.suggestedEmailLocalPart ?? null;
  useEffect(() => {
    setLocalPart(suggestedLocalPart ?? '');
  }, [agentType, suggestedLocalPart]);

  useEffect(() => {
    api
      .adminListOrphanedWaNumbers()
      .then((r) => setOrphans(r.numbers))
      .catch(() => setOrphans([]));
  }, []);

  const waOptions = useMemo(
    () => [
      { value: WA_NONE, label: t.adminAddAgentWaNone },
      ...(orphans ?? []).map((n) => ({ value: n.phoneNumber, label: n.phoneNumber })),
      { value: WA_MANUAL, label: t.adminWaOptionManualTitle },
    ],
    [orphans, t],
  );

  const chosenNumber = waChoice === WA_MANUAL ? manualNumber.trim() : waChoice;

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const { agent } = await api.adminEnableAgent(
        userId,
        agentType,
        emailCapable ? localPart.trim() : undefined,
        taxYearCapable ? taxYear : undefined,
      );
      if (chosenNumber) {
        try {
          await api.adminSetWaSender(agent.id, chosenNumber);
        } catch {
          // The agent exists and is enabled — surface the partial failure and
          // leave the number to the agent page instead of rolling anything back.
          await onAdded();
          setError(t.adminAddAgentWaFailed);
          setBusy(false);
          return;
        }
      }
      await onAdded();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(t.adminAgentEmailConflict);
      else setError(err instanceof ApiError ? err.message : t.adminAddAgentFailed);
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{t.adminAddAgent}</h2>

        <label className="field">
          <span>{t.adminAddAgentTypeLabel}</span>
          <Dropdown value={agentType} options={typeOptions} onChange={setAgentType} />
        </label>

        {emailCapable && (
          <>
            <p className="muted">{t.adminAgentActivateEmailExplain}</p>
            <span className="wa-manual-entry" dir="ltr">
              <input
                dir="ltr"
                aria-label={t.adminAgentActivateEmailLabel}
                placeholder={suggestedLocalPart ?? ''}
                value={localPart}
                disabled={busy}
                onChange={(e) => setLocalPart(e.target.value)}
              />
              <span className="muted">@{emailDomain}</span>
            </span>
          </>
        )}

        {taxYearCapable && (
          <>
            <p className="muted">{t.adminAgentActivateTaxYearExplain}</p>
            <span className="wa-manual-entry" dir="ltr">
              <span className="tax-year-dropdown">
                <Dropdown
                  value={String(taxYear)}
                  options={taxYearOptions(defaultTaxYear)}
                  onChange={(v) => setTaxYear(Number(v))}
                />
              </span>
              <span className="muted">{t.adminAgentTaxYearLabel}</span>
            </span>
          </>
        )}

        <p className="muted">{t.adminAddAgentWaLead}</p>
        <label className="field">
          <span>{t.adminWaNumberLabel}</span>
          <Dropdown value={waChoice} options={waOptions} onChange={setWaChoice} />
        </label>
        {waChoice === WA_MANUAL && (
          <span className="wa-manual-entry" dir="ltr">
            <input
              dir="ltr"
              aria-label={t.adminWaNumberLabel}
              placeholder="+15551234567"
              value={manualNumber}
              disabled={busy}
              onChange={(e) => setManualNumber(e.target.value)}
            />
          </span>
        )}

        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={
              busy ||
              !agentType ||
              (emailCapable && !localPart.trim()) ||
              (waChoice === WA_MANUAL && !manualNumber.trim())
            }
            onClick={() => void submit()}
          >
            {busy ? t.saving : t.adminAddAgent}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
