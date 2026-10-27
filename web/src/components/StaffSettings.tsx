import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError, type StaffAddRefusal, type StaffEntry } from '../api';
import { formatTimestamp } from '../format';
import { useT } from '../i18n';
import { ConfirmModal } from './ConfirmModal';
import { SettingsGroup, SettingsRow } from './SettingsUI';
import { Spinner } from './Spinner';

/**
 * The accountant's staff list (openspec `accountant-employee-access`): the
 * email addresses of employees who may sign in and read this workspace. Shown
 * to the accountant and to an admin viewing as them; never to a staff viewer
 * (Settings hides the tab and the server refuses the routes).
 */
export function StaffSettings() {
  const { t } = useT();
  const [staff, setStaff] = useState<StaffEntry[] | null>(null);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<StaffEntry | null>(null);

  useEffect(() => {
    api
      .listStaff()
      .then(({ staff: list }) => setStaff(list))
      .catch((err) => setError(err instanceof ApiError ? err.message : t.staffLoadFailed));
  }, [t]);

  const refusalText = (code: string | undefined): string | null => {
    switch (code as StaffAddRefusal | 'invalid_email' | undefined) {
      case 'own_email':
        return t.staffRefuseOwnEmail;
      case 'admin_email':
        return t.staffRefuseAdmin;
      case 'accountant_email':
        return t.staffRefuseAccountant;
      case 'other_accountants_staff':
        return t.staffRefuseOtherStaff;
      case 'duplicate':
        return t.staffRefuseDuplicate;
      case 'invalid_email':
        return t.staffRefuseInvalid;
      default:
        return null;
    }
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    try {
      const { entry } = await api.addStaff(value);
      setStaff((list) => [...(list ?? []), entry]);
      setEmail('');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      setError(refusalText(code) ?? (err instanceof ApiError ? err.message : t.staffAddFailed));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry: StaffEntry) => {
    setBusy(true);
    setError(null);
    try {
      await api.removeStaff(entry.id);
      setStaff((list) => (list ?? []).filter((s) => s.id !== entry.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.staffRemoveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <SettingsGroup title={t.staffTitle}>
        <SettingsRow title={t.staffAddTitle} description={t.staffAddDesc} stack>
          <form className="staff-add-form" onSubmit={add}>
            <input
              type="email"
              dir="ltr"
              placeholder={t.staffEmailPlaceholder}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
              required
            />
            <button className="btn btn-primary" type="submit" disabled={busy || !email.trim()}>
              {busy ? <Spinner /> : t.staffAddButton}
            </button>
          </form>
          {error && <div className="error-banner">{error}</div>}
        </SettingsRow>
      </SettingsGroup>

      <SettingsGroup title={t.staffListTitle}>
        {staff === null ? (
          <div className="settings-row">
            <span className="muted">{t.loading}</span>
          </div>
        ) : staff.length === 0 ? (
          <div className="settings-row">
            <span className="muted">{t.staffEmpty}</span>
          </div>
        ) : (
          staff.map((entry) => (
            <SettingsRow
              key={entry.id}
              title={entry.email}
              description={t.staffAddedOn(formatTimestamp(entry.createdAt))}
              control={
                <span className="staff-row-controls">
                  {entry.signedIn ? (
                    <span className="badge badge-success">{t.staffSignedIn}</span>
                  ) : (
                    <span className="badge badge-neutral" title={t.staffNotSignedInTitle}>
                      {t.staffNotSignedIn}
                    </span>
                  )}
                  <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => setRemoving(entry)}>
                    {t.staffRemove}
                  </button>
                </span>
              }
            />
          ))
        )}
      </SettingsGroup>

      {removing && (
        <ConfirmModal
          title={t.staffRemoveTitle}
          note={t.staffRemoveNote(removing.email)}
          confirmLabel={t.staffRemove}
          danger
          onConfirm={() => {
            const entry = removing;
            setRemoving(null);
            remove(entry).catch(console.error);
          }}
          onClose={() => setRemoving(null)}
        />
      )}
    </>
  );
}
