import { useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type Client } from '../api';
import { useT } from '../i18n';

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

export function AddClientModal({ onCreated, onClose }: Props) {
  const { t } = useT();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [documents, setDocuments] = useState<DocumentDraft[]>(DEFAULT_DOCUMENTS);
  const [docDraft, setDocDraft] = useState('');
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
      setError(t.atLeastOneDoc);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { client } = await api.createClient({ name, email, documents });
      onCreated(client);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.createClientFailed);
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{t.addClientTitle}</h2>
        <p className="muted">{t.addClientLead}</p>
        <label className="field">
          <span>{t.nameLabel}</span>
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label className="field">
          <span>{t.emailLabel}</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <div className="field">
          <span>{t.documentsToCollect}</span>
          {documents.length > 0 && (
            <ul className="doc-chip-list">
              {documents.map((doc) => (
                <li key={doc.name} className="doc-chip" title={doc.description ?? undefined}>
                  {doc.name}
                  <button
                    type="button"
                    className="chip-x"
                    title={t.removeNamed(doc.name)}
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
              placeholder={t.egForm106}
              aria-label={t.docNameAria}
            />
            <button type="button" className="btn btn-ghost" onClick={addDocument} disabled={!docDraft.trim()}>
              {t.addDocument}
            </button>
          </div>
        </div>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t.creating : t.create}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
