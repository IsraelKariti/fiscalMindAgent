import { useEffect, useRef, useState } from 'react';
import { api, type PromptTemplateState } from '../api';
import { LOCALE } from '../format';
import { useT } from '../i18n';

export function PromptSettings() {
  const { t } = useT();
  const [state, setState] = useState<PromptTemplateState | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [draft, state]);

  useEffect(() => {
    api
      .getPromptTemplate()
      .then((s) => {
        setState(s);
        setDraft(s.template);
      })
      .catch(() => setMessage({ kind: 'error', text: t.promptLoadFailed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!state) return <div className="muted">{message?.text ?? t.loading}</div>;

  const dirty = draft !== state.template;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.savePromptTemplate(draft);
      setState(next);
      setDraft(next.template);
      setMessage({ kind: 'ok', text: t.promptSaved });
    } catch {
      setMessage({ kind: 'error', text: t.saveFailed });
    } finally {
      setBusy(false);
    }
  };

  const reset = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.resetPromptTemplate();
      setState(next);
      setDraft(next.template);
      setMessage({ kind: 'ok', text: t.promptRestored });
    } catch {
      setMessage({ kind: 'error', text: t.resetFailed });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="client-view">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>{t.geminiSystemPrompt}</h2>
            <span className={`badge ${state.isCustom ? 'badge-pending' : 'badge-neutral'}`}>
              {state.isCustom ? t.customTemplate : t.builtinDefault}
            </span>
            {state.updatedAt && (
              <span className="muted badge-note">
                {t.lastSaved(new Date(state.updatedAt).toLocaleString(LOCALE))}
              </span>
            )}
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={reset} disabled={busy || !state.isCustom}>
              {t.resetToDefault}
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !dirty || draft.trim() === ''}>
              {busy ? t.saving : t.save}
            </button>
          </div>
        </div>

        <p className="muted">{t.promptLead}</p>
        <div className="placeholder-chips">
          {state.placeholders.map((name) => (
            <button
              key={name}
              className="chip"
              type="button"
              title={t.appendAtEnd}
              onClick={() => setDraft((d) => `${d}{{${name}}}`)}
            >
              {`{{${name}}}`}
            </button>
          ))}
        </div>

        <textarea
          ref={editorRef}
          className="prompt-editor"
          dir="auto"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={4}
          spellCheck={false}
        />
        {message && <div className={message.kind === 'ok' ? 'ok-banner' : 'error-banner'}>{message.text}</div>}
      </section>
    </div>
  );
}
