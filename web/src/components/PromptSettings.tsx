import { useEffect, useRef, useState } from 'react';
import { api, type PromptTemplateState } from '../api';
import { LOCALE } from '../format';

export function PromptSettings() {
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
      .catch(() => setMessage({ kind: 'error', text: 'טעינת תבנית הפרומפט נכשלה.' }));
  }, []);

  if (!state) return <div className="muted">{message?.text ?? 'טוען…'}</div>;

  const dirty = draft !== state.template;

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const next = await api.savePromptTemplate(draft);
      setState(next);
      setDraft(next.template);
      setMessage({ kind: 'ok', text: 'נשמר. הקריאה הבאה ל־Gemini תשתמש בתבנית הזו.' });
    } catch {
      setMessage({ kind: 'error', text: 'השמירה נכשלה.' });
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
      setMessage({ kind: 'ok', text: 'שוחזר לתבנית ברירת המחדל המובנית.' });
    } catch {
      setMessage({ kind: 'error', text: 'האיפוס נכשל.' });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="client-view">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>פרומפט המערכת של Gemini</h2>
            <span className={`badge ${state.isCustom ? 'badge-pending' : 'badge-neutral'}`}>
              {state.isCustom ? 'תבנית מותאמת' : 'ברירת מחדל מובנית'}
            </span>
            {state.updatedAt && (
              <span className="muted badge-note">נשמר לאחרונה {new Date(state.updatedAt).toLocaleString(LOCALE)}</span>
            )}
          </div>
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={reset} disabled={busy || !state.isCustom}>
              איפוס לברירת המחדל
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy || !dirty || draft.trim() === ''}>
              {busy ? 'שומר…' : 'שמירה'}
            </button>
          </div>
        </div>

        <p className="muted">
          התבנית הזו הופכת להנחיית המערכת בכל קריאת החלטה של Gemini (האם היעד הושלם, ואיזה מייל מעקב לנסח).
          מצייני המקום מתמלאים לכל לקוח בזמן הקריאה:
        </p>
        <div className="placeholder-chips">
          {state.placeholders.map((name) => (
            <button
              key={name}
              className="chip"
              type="button"
              title="הוספה בסוף"
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
