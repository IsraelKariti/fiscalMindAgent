import { useState, type FormEvent } from 'react';
import { api, ApiError, type ClientDocument } from '../api';

interface Props {
  clientId: string;
  documents: ClientDocument[];
  onChanged: () => Promise<void>;
}

export function DocumentsCard({ clientId, documents, onChanged }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const collected = documents.filter((d) => d.status === 'collected').length;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'עדכון המסמכים נכשל.');
    } finally {
      setBusy(false);
    }
  };

  const add = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    run(async () => {
      await api.addDocument(clientId, { name: trimmed, description: description.trim() || null });
      setName('');
      setDescription('');
    });
  };

  return (
    <section className="card panel">
      <div className="panel-header">
        <h3>מסמכים נדרשים</h3>
        {documents.length > 0 && (
          <span className={`badge ${collected === documents.length ? 'badge-success' : 'badge-pending'}`}>
            {collected} / {documents.length} נאספו
          </span>
        )}
      </div>

      <div className="panel-body">
        {error && <div className="error-banner">{error}</div>}

        {documents.length === 0 ? (
          <p className="muted">לא הוגדרו מסמכים — לסוכן אין מה לאסוף מהלקוח הזה.</p>
        ) : (
          <ul className="doc-list">
            {documents.map((doc) => (
              <li key={doc.id} className={`doc-row ${doc.status}`}>
                <label className="doc-check" title={doc.status === 'collected' ? 'סימון כממתין' : 'סימון כנאסף'}>
                  <input
                    type="checkbox"
                    checked={doc.status === 'collected'}
                    disabled={busy}
                    onChange={() =>
                      run(() =>
                        api.updateDocument(clientId, doc.id, {
                          status: doc.status === 'collected' ? 'pending' : 'collected',
                        }),
                      )
                    }
                  />
                  <span className="doc-text">
                    <span className="doc-name">{doc.name}</span>
                    {doc.description && <span className="doc-desc muted">{doc.description}</span>}
                  </span>
                </label>
                <span className={`badge ${doc.status === 'collected' ? 'badge-success' : 'badge-pending'}`}>
                  {doc.status === 'collected' ? 'נאסף' : 'ממתין'}
                </span>
                <button
                  className="chip-x"
                  title="הסרת המסמך"
                  disabled={busy}
                  onClick={() => run(() => api.deleteDocument(clientId, doc.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="doc-add-form panel-footer" onSubmit={add}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="שם המסמך, למשל טופס 106"
          aria-label="שם המסמך"
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="תיאור (אופציונלי, עוזר לסוכן להסביר את המסמך)"
          aria-label="תיאור המסמך"
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
          הוספת מסמך
        </button>
      </form>
    </section>
  );
}
