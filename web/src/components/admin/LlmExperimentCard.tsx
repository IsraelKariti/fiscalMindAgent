import { useEffect, useState } from 'react';
import { api, ApiError, LLM_CALL_PURPOSES, type LlmCallPurpose, type LlmExperiment, type LlmExperimentState } from '../../api';
import { formatUsd, LOCALE } from '../../format';
import { useT } from '../../i18n';
import { Dropdown } from '../Dropdown';
import { MODEL_LABELS } from './shared';

const ARM_KEYS = ['A', 'B', 'C', 'D'];

/**
 * The admin LLM A/B experiment card (declaration_of_capital only): arm editor
 * (model + optional per-arm prompt override) and the per-arm scoreboard built
 * from the per-call log — calls, tokens by kind, and cost at call-time prices.
 * The parent owns the fetched state so the conversations card's arm column
 * stays in sync with edits here.
 */
export function LlmExperimentCard({
  instanceId,
  state,
  onChanged,
}: {
  instanceId: string;
  /** Null while loading. */
  state: LlmExperimentState | null;
  onChanged: () => Promise<void>;
}) {
  const { t } = useT();
  const [draft, setDraft] = useState<LlmExperiment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // (Re)seed the draft whenever a fresh state arrives and nothing is mid-edit.
  useEffect(() => {
    if (!state) {
      setDraft(null);
      return;
    }
    setDraft(
      (d) =>
        d ??
        state.experiment ?? {
          enabled: false,
          arms: [
            { key: 'A', model: state.options[0] ?? '', promptTemplate: null },
            { key: 'B', model: state.options[1] ?? state.options[0] ?? '', promptTemplate: null },
          ],
        },
    );
  }, [state]);

  const patchArm = (index: number, patch: Partial<LlmExperiment['arms'][number]>) => {
    setDraft((d) =>
      d ? { ...d, arms: d.arms.map((a, i) => (i === index ? { ...a, ...patch } : a)) } : d,
    );
    setSaved(false);
  };

  const addArm = () => {
    setDraft((d) => {
      if (!d || d.arms.length >= ARM_KEYS.length) return d;
      const used = new Set(d.arms.map((a) => a.key));
      const key = ARM_KEYS.find((k) => !used.has(k)) ?? `arm${d.arms.length + 1}`;
      return { ...d, arms: [...d.arms, { key, model: state?.options[0] ?? '', promptTemplate: null }] };
    });
    setSaved(false);
  };

  const removeArm = (index: number) => {
    setDraft((d) => (d && d.arms.length > 1 ? { ...d, arms: d.arms.filter((_, i) => i !== index) } : d));
    setSaved(false);
  };

  const save = async (next?: LlmExperiment) => {
    const experiment = next ?? draft;
    if (!experiment) return;
    setBusy(true);
    setError(null);
    try {
      await api.adminSetLlmExperiment(instanceId, experiment);
      setSaved(true);
      setDraft(experiment);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.adminLlmExperimentSaveFailed);
    } finally {
      setBusy(false);
    }
  };

  const modelOptions = (current: string) => {
    const options = state?.options ?? [];
    const all = options.includes(current) || !current ? options : [...options, current];
    return all.map((m) => ({ value: m, label: MODEL_LABELS[m] ?? m }));
  };

  // Per-call-site pin: '' = follow the arm's default model.
  const pinArmModel = (index: number, purpose: LlmCallPurpose, value: string) => {
    setDraft((d) => {
      if (!d) return d;
      return {
        ...d,
        arms: d.arms.map((a, i) => {
          if (i !== index) return a;
          const models = { ...(a.models ?? {}) };
          if (value) models[purpose] = value;
          else delete models[purpose];
          return { ...a, models: Object.keys(models).length > 0 ? models : undefined };
        }),
      };
    });
    setSaved(false);
  };

  const variantLabel = (v: string | null) => (v === null ? t.adminLlmExperimentNoVariant : v);

  return (
    <section className="card">
      <div className="settings-section">
        <div className="card-header">
          <div className="card-title-row">
            <h3>{t.adminLlmExperimentTitle}</h3>
            {state?.experiment?.enabled && (
              <span className="badge badge-success">{t.adminLlmExperimentEnabledBadge}</span>
            )}
          </div>
          {draft && (
            <button
              className="btn btn-ghost btn-small"
              disabled={busy}
              onClick={() => void save({ ...draft, enabled: !draft.enabled })}
            >
              {draft.enabled ? t.adminLlmExperimentDisable : t.adminLlmExperimentEnable}
            </button>
          )}
        </div>
        <p className="muted">{t.adminLlmExperimentDesc}</p>
        {error && <div className="error-banner">{error}</div>}
        {!draft && !error && <p className="muted">{t.loading}</p>}

        {draft?.arms.map((arm, i) => (
          <div className="wa-action-row" key={arm.key} style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', flexWrap: 'wrap' }}>
              <span className="doc-name">{t.adminLlmExperimentArmTitle(arm.key)}</span>
              <span className="badge badge-neutral">
                {t.adminLlmExperimentClientsCount(state?.clientCounts?.[arm.key] ?? 0)}
              </span>
              <span className="tax-year-dropdown" style={{ minWidth: 220 }}>
                <Dropdown
                  value={arm.model}
                  options={modelOptions(arm.model)}
                  onChange={(v) => patchArm(i, { model: v })}
                />
              </span>
              <button
                className="btn btn-ghost btn-small"
                onClick={() =>
                  patchArm(i, {
                    promptTemplate: arm.promptTemplate === null ? (state?.defaultPromptTemplate ?? '') : null,
                  })
                }
              >
                {arm.promptTemplate === null
                  ? t.adminLlmExperimentPromptUseCustom
                  : t.adminLlmExperimentPromptUseDefault}
              </button>
              {draft.arms.length > 1 && (
                <button className="btn btn-ghost btn-small danger-action" onClick={() => removeArm(i)}>
                  {t.adminLlmExperimentRemoveArm}
                </button>
              )}
            </div>
            <div style={{ width: '100%' }}>
              <span className="doc-desc">{t.adminLlmExperimentModelsTitle}</span>
              <span className="doc-desc muted"> — {t.adminLlmExperimentModelsDesc}</span>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8, marginTop: 6 }}>
                {LLM_CALL_PURPOSES.map((purpose) => (
                  <label key={purpose} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span className="doc-desc muted">{t.adminLlmExperimentPurposeLabel[purpose] ?? purpose}</span>
                    <span className="tax-year-dropdown">
                      <Dropdown
                        value={arm.models?.[purpose] ?? ''}
                        options={[
                          { value: '', label: `${t.adminLlmExperimentModelSameAsArm} (${MODEL_LABELS[arm.model] ?? arm.model})` },
                          ...modelOptions(arm.models?.[purpose] ?? ''),
                        ]}
                        onChange={(v) => pinArmModel(i, purpose, v)}
                      />
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {arm.promptTemplate === null ? (
              <span className="doc-desc muted">{t.adminLlmExperimentPromptDefaultNote}</span>
            ) : (
              <>
                <span className="doc-desc muted">{t.adminLlmExperimentPromptCustom}</span>
                <textarea
                  dir="rtl"
                  style={{ width: '100%', minHeight: 180, fontFamily: 'inherit' }}
                  value={arm.promptTemplate}
                  onChange={(e) => patchArm(i, { promptTemplate: e.target.value })}
                />
              </>
            )}
          </div>
        ))}

        {draft && (
          <div className="btn-row">
            {draft.arms.length < ARM_KEYS.length && (
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={addArm}>
                {t.adminLlmExperimentAddArm}
              </button>
            )}
            <button className="btn btn-primary btn-small" disabled={busy} onClick={() => void save()}>
              {t.adminLlmExperimentSave}
            </button>
            {saved && <span className="muted">{t.adminLlmExperimentSaved}</span>}
          </div>
        )}

        <h3>{t.adminLlmExperimentStatsTitle}</h3>
        {state && state.stats.length === 0 && <p className="muted">{t.adminLlmExperimentStatsEmpty}</p>}
        {state && state.stats.length > 0 && (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t.adminLlmExperimentColVariant}</th>
                  <th>{t.modelLabel}</th>
                  <th>{t.adminLlmExperimentColClients}</th>
                  <th>{t.adminLlmExperimentColCalls}</th>
                  <th>{t.adminLlmExperimentColErrors}</th>
                  <th>{t.inputTokens}</th>
                  <th>{t.outputTokens}</th>
                  <th>{t.thinkingTokens}</th>
                  <th>{t.cachedTokens}</th>
                  <th>{t.totalCost}</th>
                </tr>
              </thead>
              <tbody>
                {state.stats.map((s) => (
                  <tr key={`${s.variant ?? ''}:${s.model}`}>
                    <td>{variantLabel(s.variant)}</td>
                    <td>{MODEL_LABELS[s.model] ?? s.model}</td>
                    <td dir="ltr">{s.clients.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{s.calls.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{s.errorCalls.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{s.inputTokens.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{s.outputTokens.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{s.thinkingTokens.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{s.cachedTokens.toLocaleString(LOCALE)}</td>
                    <td dir="ltr">{s.cost !== null ? `${formatUsd(s.cost)}${s.unpricedCalls > 0 ? '+' : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
