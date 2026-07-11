import { useState } from 'react';
import { type Client } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { LOCALE } from '../format';
import { useT } from '../i18n';

interface Props {
  client: Client;
  onSaved: (client: Client) => Promise<void>;
}

interface Draft {
  name: string;
  occupation: string;
  phone: string;
  company: string;
  notes: string;
}

function toDraft(client: Client): Draft {
  return {
    name: client.name,
    occupation: client.occupation ?? '',
    phone: client.phone ?? '',
    company: client.company ?? '',
    notes: client.notes ?? '',
  };
}

const iconProps = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

const icons = {
  mail: (
    <svg {...iconProps} aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </svg>
  ),
  phone: (
    <svg {...iconProps} aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  company: (
    <svg {...iconProps} aria-hidden="true">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M9 22v-4h6v4M9 6h.01M15 6h.01M9 10h.01M15 10h.01M9 14h.01M15 14h.01" />
    </svg>
  ),
  occupation: (
    <svg {...iconProps} aria-hidden="true">
      <rect x="2" y="7" width="20" height="14" rx="2" />
      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
    </svg>
  ),
  calendar: (
    <svg {...iconProps} aria-hidden="true">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
  notes: (
    <svg {...iconProps} aria-hidden="true">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  ),
  chevron: (
    <svg {...iconProps} className="chevron" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  ),
};

function MetaChip({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <span className="meta-chip" title={`${label}: ${value}`}>
      {icon}
      <span className="meta-chip-text">{value}</span>
    </span>
  );
}

export function ClientHeader({ client, onSaved }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [editing, setEditing] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(() => toDraft(client));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const set = (field: keyof Draft) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setDraft({ ...draft, [field]: e.target.value });

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const { client: updated } = await api.updateClient(client.id, {
        name: draft.name.trim() || client.name,
        occupation: draft.occupation.trim() || null,
        phone: draft.phone.trim() || null,
        company: draft.company.trim() || null,
        notes: draft.notes.trim() || null,
      });
      await onSaved(updated);
      setEditing(false);
    } catch {
      setError(t.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card client-header">
      <div className="client-header-top">
        <div className="client-header-id">
          <h2>{client.name}</h2>
          <span className={`badge ${client.goal_status === 'complete' ? 'badge-success' : 'badge-pending'}`}>
            {client.goal_status === 'complete' ? t.allDocsReceived : t.docCollectionInProgress}
          </span>
        </div>
        {!editing ? (
          <button
            className="btn btn-ghost"
            onClick={() => {
              setDraft(toDraft(client));
              setEditing(true);
            }}
          >
            {t.edit}
          </button>
        ) : (
          <div className="btn-row">
            <button className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>
              {t.cancel}
            </button>
            <button className="btn btn-primary" onClick={save} disabled={busy}>
              {busy ? t.saving : t.save}
            </button>
          </div>
        )}
      </div>

      {error && <div className="error-banner">{error}</div>}

      {!editing ? (
        <>
          <div className="client-meta">
            <MetaChip icon={icons.mail} label={t.emailLabel} value={client.email_address} />
            {client.phone && <MetaChip icon={icons.phone} label={t.phoneLabel} value={client.phone} />}
            {client.company && <MetaChip icon={icons.company} label={t.companyLabel} value={client.company} />}
            {client.occupation && (
              <MetaChip icon={icons.occupation} label={t.occupationLabel} value={client.occupation} />
            )}
            <MetaChip
              icon={icons.calendar}
              label={t.clientSinceLabel}
              value={t.sinceDate(new Date(client.created_at).toLocaleDateString(LOCALE))}
            />
            {client.notes && (
              <button className="meta-chip" aria-expanded={notesOpen} onClick={() => setNotesOpen((o) => !o)}>
                {icons.notes}
                <span className="meta-chip-text">{t.notesLabel}</span>
                {icons.chevron}
              </button>
            )}
          </div>
          {notesOpen && client.notes && <p className="client-notes">{client.notes}</p>}
        </>
      ) : (
        <div className="detail-grid client-edit-grid">
          <label className="field">
            <span>{t.nameLabel}</span>
            <input value={draft.name} onChange={set('name')} />
          </label>
          <label className="field">
            <span>{t.occupationLabel}</span>
            <input value={draft.occupation} onChange={set('occupation')} placeholder={t.occupationPlaceholder} />
          </label>
          <label className="field">
            <span>{t.companyLabel}</span>
            <input value={draft.company} onChange={set('company')} />
          </label>
          <label className="field">
            <span>{t.phoneLabel}</span>
            <input value={draft.phone} onChange={set('phone')} />
          </label>
          <label className="field detail-wide">
            <span>{t.notesLabel}</span>
            <textarea value={draft.notes} onChange={set('notes')} rows={3} />
          </label>
        </div>
      )}
    </section>
  );
}
