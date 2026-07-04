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

/** Default checklist for a self-employed annual tax return (דוח שנתי לעצמאים). */
const DEFAULT_DOCUMENTS: DocumentDraft[] = [
  {
    name: 'סיכומי הכנסות',
    description: 'ריכוז חשבוניות מס, קבלות או דוחות של מערכת הפקת החשבוניות (ספר פדיון יומי).',
  },
  {
    name: 'חשבוניות הוצאות',
    description: "כל החשבוניות על הוצאות העסק (שכר דירה, אינטרנט, ציוד, נסיעות וכו').",
  },
  {
    name: 'דוחות מהבנק',
    description: 'דפי חשבון בנק וריכוז יתרות לסוף השנה (אם מנהלים חשבון נפרד לעסק).',
  },
  {
    name: 'טופס 867',
    description: 'אישור מהבנק על רווחים/הפסדים מהשקעות, ריביות וניכוי מס במקור.',
  },
  {
    name: 'אישורים מהביטוחים',
    description:
      'אישור שנתי לצורכי מס מחברות הביטוח וקרנות הפנסיה (על הפקדות לקרן פנסיה, קרן השתלמות ואובדן כושר עבודה).',
  },
  {
    name: 'אישורי ניכוי מס במקור',
    description: 'אישורים מלקוחות שניכו לכם מס במקור במהלך השנה.',
  },
  {
    name: 'טופס 106',
    description: 'אם העצמאי (או בן/בת הזוג) עבד גם כשכיר במהלך השנה.',
  },
  {
    name: 'אישור על תרומות',
    description: 'קבלות מקוריות לפי סעיף 46.',
  },
  {
    name: 'מסמכים אישיים',
    description:
      "צילום תעודת זהות עם הספח (לעדכון מצב משפחתי, ילדים וכו') ואישור תושבות בפריפריה (אם רלוונטי).",
  },
];

export function AddClientModal({ onCreated, onClose }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [documents, setDocuments] = useState<DocumentDraft[]>(DEFAULT_DOCUMENTS);
  const [docDraft, setDocDraft] = useState('');
  const [subject, setSubject] = useState('Documents needed for your filing');
  const [body, setBody] = useState('');
  const [delayMinutes, setDelayMinutes] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const addDocument = () => {
    const trimmed = docDraft.trim();
    if (!trimmed || documents.some((d) => d.name === trimmed)) return;
    setDocuments([...documents, { name: trimmed }]);
    setDocDraft('');
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (documents.length === 0) {
      setError('Add at least one document for the agent to collect.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { client } = await api.createClient({ name, email, subject, body, delayMinutes, documents });
      onCreated(client);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to create client.');
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>Add client</h2>
        <p className="muted">
          The agent sends the first email after the chosen delay, then manages follow-ups on its own until every
          document is collected.
        </p>
        <label className="field">
          <span>Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>Email</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <div className="field">
          <span>Documents to collect</span>
          {documents.length > 0 && (
            <ul className="doc-chip-list">
              {documents.map((doc) => (
                <li key={doc.name} className="doc-chip" title={doc.description ?? undefined}>
                  {doc.name}
                  <button
                    type="button"
                    className="chip-x"
                    title={`Remove ${doc.name}`}
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
              placeholder="e.g. טופס 106"
              aria-label="Document name"
            />
            <button type="button" className="btn btn-ghost" onClick={addDocument} disabled={!docDraft.trim()}>
              Add document
            </button>
          </div>
        </div>
        <label className="field">
          <span>First email subject</span>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} required />
        </label>
        <label className="field">
          <span>First email body</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required />
        </label>
        <label className="field">
          <span>Send after (minutes)</span>
          <input
            type="number"
            min={0}
            value={delayMinutes}
            onChange={(e) => setDelayMinutes(Number(e.target.value))}
            required
          />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create & schedule'}
          </button>
        </div>
      </form>
    </div>
  );
}
