import { useEffect, useState } from 'react';
import { api, type PromptTemplateState } from '../api';

export function PromptSettings() {
  const [state, setState] = useState<PromptTemplateState | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  useEffect(() => {
    api
      .getPromptTemplate()
      .then((s) => {
        setState(s);
        setDraft(s.template);
      })
      .catch(() => setMessage({ kind: 'error', text: 'Failed to load the prompt template.' }));
  }, []);

  if (!state) return <div className="muted">{message?.text ?? 'Loading…'}</div>;

  const dirty = draft !== state.template;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.savePromptTemplate(draft);
      setState(next);
      setDraft(next.template);
      setMessage({ kind: 'ok', text: 'Saved. The next Gemini call will use this template.' });
    } catch {
      setMessage({ kind: 'error', text: 'Failed to save.' });
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
      setMessage({ kind: 'ok', text: 'Reverted to the built-in default template.' });
    } catch {
      setMessage({ kind: 'error', text: 'Failed to reset.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="client-view">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Gemini system prompt</h2>
            <span className={`badge ${state.isCustom ? 'badge-pending' : 'badge-neutral'}`}>
              {state.isCustom ? 'Custom template' : 'Built-in default'}
            </span>
            {state.updatedAt && (
              <span className="muted badge-note">last saved {new Date(state.updatedAt).toLocaleString()}</span>
            )}
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={reset} disabled={busy || !state.isCustom}>
              Reset to default
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !dirty || draft.trim() === ''}>
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>

        <p className="muted">
          This template becomes the system instruction for every Gemini decision call (whether the goal is complete,
          and what follow-up email to draft). Placeholders are filled in per client at call time:
        </p>
        <div className="placeholder-chips">
          {state.placeholders.map((name) => (
            <button
              key={name}
              className="chip"
              type="button"
              title="Insert at end"
              onClick={() => setDraft((d) => `${d}{{${name}}}`)}
            >
              {`{{${name}}}`}
            </button>
          ))}
        </div>

        <textarea
          className="prompt-editor"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={24}
          spellCheck={false}
        />
        {message && <div className={message.kind === 'ok' ? 'ok-banner' : 'error-banner'}>{message.text}</div>}
      </section>
    </div>
  );
}
