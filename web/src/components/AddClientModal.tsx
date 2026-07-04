import { useState, type FormEvent } from 'react';
import { api, ApiError, type Client } from '../api';

interface Props {
  onCreated: (client: Client) => void;
  onClose: () => void;
}

interface DocumentDraft {
  name: string;
  description?: string | null;
}

/**
 * Default checklist for a self-employed annual tax return (דוח שנתי לעצמאים).
 * Each entry must represent a single physical document (one file the client
 * can send), never a collection of documents — the agent tracks a
 * pending/collected status per entry.
 */
const DEFAULT_DOCUMENTS: DocumentDraft[] = [
  {
    name: 'דוח ריכוז הכנסות שנתי',
    description:
      'דוח מסכם אחד ממערכת הפקת החשבוניות (או ספר הפדיון היומי) עם סך ההכנסות לשנת המס.',
  },
  {
    name: 'דוח ריכוז הוצאות שנתי',
    description:
      "דוח או טבלה אחת המרכזת את כל הוצאות העסק לשנת המס (שכר דירה, אינטרנט, ציוד, נסיעות וכו').",
  },
  {
    name: 'אישור יתרות מהבנק ל-31 בדצמבר',
    description: 'אישור יתרות אחד לסוף שנת המס מחשבון הבנק של העסק.',
  },
  {
    name: 'טופס 867',
    description: 'אישור מהבנק על רווחים/הפסדים מהשקעות, ריביות וניכוי מס במקור.',
  },
  {
    name: 'אישור שנתי מקרן הפנסיה',
    description: 'אישור שנתי לצורכי מס על הפקדות לקרן הפנסיה.',
  },
  {
    name: 'אישור שנתי מקרן ההשתלמות',
    description: 'אישור שנתי לצורכי מס על הפקדות לקרן ההשתלמות.',
  },
  {
    name: 'אישור שנתי מביטוח אובדן כושר עבודה',
    description: 'אישור שנתי לצורכי מס מחברת הביטוח על תשלומים לביטוח אובדן כושר עבודה.',
  },
  {
    name: 'אישור שנתי על ניכוי מס במקור',
    description: 'אישור שנתי מלקוח שניכה מס במקור במהלך השנה (אם רלוונטי).',
  },
  {
    name: 'טופס 106',
    description: 'אם העצמאי (או בן/בת הזוג) עבד גם כשכיר במהלך השנה.',
  },
  {
    name: 'אישור שנתי על תרומות',
    description: 'אישור מרכז אחד מהמוסד שנתרם לו, לפי סעיף 46.',
  },
  {
    name: 'צילום תעודת זהות עם ספח',
    description: "לעדכון מצב משפחתי, ילדים וכו'.",
  },
  {
    name: 'אישור תושבות',
    description: 'אישור תושבות ביישוב מזכה בפריפריה (אם רלוונטי).',
  },
];

const pad = (n: number) => String(n).padStart(2, '0');

/** Local-time value for an <input type="date"> (YYYY-MM-DD). */
function toDateValue(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local-time value for an <input type="time"> (HH:MM). */
function toTimeValue(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Gmail-style schedule-send presets: most sends are "now-ish" or "next
 * morning", so one tap covers them and the date/time inputs stay for the rest.
 */
const SEND_PRESETS = [
  { id: 'now', label: 'עכשיו', resolve: () => new Date() },
  { id: 'hour', label: 'בעוד שעה', resolve: () => new Date(Date.now() + 60 * 60_000) },
  {
    id: 'tomorrow',
    label: 'מחר ב־9:00',
    resolve: () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  { id: 'week', label: 'בעוד שבוע', resolve: () => new Date(Date.now() + 7 * 24 * 60 * 60_000) },
] as const;

/** Hebrew "in about…" phrasing for the live confirmation line. */
function relativeLabel(msFromNow: number): string {
  const minutes = Math.round(msFromNow / 60_000);
  if (minutes <= 1) return 'בעוד דקה';
  if (minutes < 60) return `בעוד ${minutes} דקות`;
  const hours = Math.round(minutes / 60);
  if (hours === 1) return 'בעוד כשעה';
  if (hours === 2) return 'בעוד כשעתיים';
  if (hours < 24) return `בעוד כ־${hours} שעות`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'מחר';
  if (days === 2) return 'בעוד יומיים';
  return `בעוד ${days} ימים`;
}

const summaryDateFormat = new Intl.DateTimeFormat('he-IL', { weekday: 'long', day: 'numeric', month: 'long' });

// The annual return is filed for the previous calendar year.
const TAX_YEAR = new Date().getFullYear() - 1;

/**
 * Default first email. Sent verbatim (nothing appends the document list later),
 * so the body must carry the list itself — kept otherwise as short as possible.
 */
function buildDefaultBody(name: string, documents: DocumentDraft[]): string {
  const greeting = name.trim() ? `שלום ${name.trim()},` : 'שלום,';
  const list = documents.map((doc) => `• ${doc.name}`).join('\n');
  return `${greeting}

לצורך הכנת הדוח השנתי לשנת המס ${TAX_YEAR}, נשמח לקבל במענה למייל זה את המסמכים הבאים:

${list}

אם מסמך מסוים אינו רלוונטי עבורך, אפשר פשוט לציין זאת במענה.

תודה רבה!`;
}

export function AddClientModal({ onCreated, onClose }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [documents, setDocuments] = useState<DocumentDraft[]>(DEFAULT_DOCUMENTS);
  const [docDraft, setDocDraft] = useState('');
  const [subject, setSubject] = useState(`מסמכים להכנת הדוח השנתי ${TAX_YEAR}`);
  // null = still auto-generated: the body tracks the name and document chips until first edited by hand.
  const [bodyDraft, setBodyDraft] = useState<string | null>(null);
  const body = bodyDraft ?? buildDefaultBody(name, documents);
  const [sendDraft, setSendDraft] = useState(() => {
    const d = new Date(Date.now() + 5 * 60_000);
    return { date: toDateValue(d), time: toTimeValue(d) };
  });
  const [sendPreset, setSendPreset] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addDocument = () => {
    const trimmed = docDraft.trim();
    if (!trimmed || documents.some((d) => d.name === trimmed)) return;
    setDocuments([...documents, { name: trimmed }]);
    setDocDraft('');
  };

  const sendAtDate = new Date(`${sendDraft.date}T${sendDraft.time}`);
  const sendAtValid = Boolean(sendDraft.date && sendDraft.time) && !Number.isNaN(sendAtDate.getTime());
  const sendAtMsFromNow = sendAtValid ? sendAtDate.getTime() - Date.now() : 0;

  const applyPreset = (preset: (typeof SEND_PRESETS)[number]) => {
    const d = preset.resolve();
    setSendDraft({ date: toDateValue(d), time: toTimeValue(d) });
    setSendPreset(preset.id);
  };

  const editSendDraft = (patch: Partial<typeof sendDraft>) => {
    setSendDraft((prev) => ({ ...prev, ...patch }));
    setSendPreset(null);
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (documents.length === 0) {
      setError('הוסיפו לפחות מסמך אחד שהסוכן יאסוף.');
      return;
    }
    if (!sendAtValid) {
      setError('בחרו תאריך ושעה לשליחת המייל הראשון.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { client } = await api.createClient({
        name,
        email,
        subject,
        body,
        sendAt: sendAtDate.toISOString(),
        documents,
      });
      onCreated(client);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'יצירת הלקוח נכשלה.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>הוספת לקוח</h2>
        <p className="muted">
          הסוכן שולח את המייל הראשון במועד שנבחר, ואז מנהל את המעקבים בעצמו עד שכל המסמכים נאספים.
        </p>
        <label className="field">
          <span>שם</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>אימייל</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <div className="field">
          <span>מסמכים לאיסוף</span>
          {documents.length > 0 && (
            <ul className="doc-chip-list">
              {documents.map((doc) => (
                <li key={doc.name} className="doc-chip" title={doc.description ?? undefined}>
                  {doc.name}
                  <button
                    type="button"
                    className="chip-x"
                    title={`הסרת ${doc.name}`}
                    onClick={() => setDocuments(documents.filter((d) => d.name !== doc.name))}
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="doc-add-form">
            <input
              value={docDraft}
              onChange={(e) => setDocDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDocument();
                }
              }}
              placeholder="למשל טופס 106"
              aria-label="שם המסמך"
            />
            <button type="button" className="btn btn-ghost" onClick={addDocument} disabled={!docDraft.trim()}>
              הוספת מסמך
            </button>
          </div>
        </div>
        <label className="field">
          <span>נושא המייל הראשון</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </label>
        <label className="field">
          <span>תוכן המייל הראשון</span>
          <textarea value={body} onChange={(e) => setBodyDraft(e.target.value)} rows={10} required />
        </label>
        <div className="field">
          <span>מועד השליחה הראשונה</span>
          <div className="sendat-presets" role="group" aria-label="מועדים מהירים">
            {SEND_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                className={`chip${sendPreset === preset.id ? ' chip-selected' : ''}`}
                aria-pressed={sendPreset === preset.id}
                onClick={() => applyPreset(preset)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="sendat-inputs">
            <input
              type="date"
              dir="ltr"
              aria-label="תאריך השליחה"
              min={toDateValue(new Date())}
              value={sendDraft.date}
              onChange={(e) => editSendDraft({ date: e.target.value })}
              required
            />
            <input
              type="time"
              dir="ltr"
              aria-label="שעת השליחה"
              value={sendDraft.time}
              onChange={(e) => editSendDraft({ time: e.target.value })}
              required
            />
          </div>
          {sendAtValid && (
            <div className={`sendat-summary${sendAtMsFromNow < -60_000 ? ' past' : ''}`} aria-live="polite">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              {sendAtMsFromNow < -60_000 ? (
                <span>המועד שנבחר כבר עבר — המייל יישלח מיד</span>
              ) : (
                <span>
                  יישלח ב{summaryDateFormat.format(sendAtDate)} בשעה{' '}
                  <strong dir="ltr">{sendDraft.time}</strong> · {relativeLabel(sendAtMsFromNow)}
                </span>
              )}
            </div>
          )}
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'יוצר…' : 'יצירה ותזמון'}
          </button>
        </div>
      </form>
    </div>
  );
}
