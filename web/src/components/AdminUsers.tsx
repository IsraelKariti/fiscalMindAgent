import { useEffect, useState } from 'react';
import { api, type AdminUser } from '../api';

interface Props {
  ownUserId: string;
}

export function AdminUsers({ ownUserId }: Props) {
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    api
      .adminListUsers()
      .then(({ users: list }) => setUsers(list))
      .catch(() => setError('Failed to load users.'));
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (!users) return <div className="muted">Loading…</div>;

  const impersonate = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    try {
      await api.impersonate(userId);
      // Full reload so every view refetches under the impersonated identity.
      window.location.reload();
    } catch {
      setError('Failed to start impersonation.');
      setBusyId(null);
    }
  };

  return (
    <div className="client-view">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>Users</h2>
            <span className="badge badge-neutral">{users.length} account{users.length === 1 ? '' : 's'}</span>
          </div>
        </div>
        <p className="muted">
          Open any user's dashboard to see exactly what they see. While impersonating, everything you do applies to
          their account.
        </p>
        <table className="admin-users-table">
          <thead>
            <tr>
              <th>User</th>
              <th>Clients</th>
              <th>Joined</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {users.map((u) => {
              const self = u.id === ownUserId;
              return (
                <tr key={u.id}>
                  <td>
                    <span className="client-item-text">
                      <span className="client-item-name">
                        {u.name ?? u.email}
                        {self && <span className="muted"> (you)</span>}
                      </span>
                      <span className="client-item-email muted">{u.email}</span>
                    </span>
                  </td>
                  <td>{u.clientCount}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-ghost btn-small"
                      disabled={self || busyId !== null}
                      onClick={() => impersonate(u.id)}
                    >
                      {busyId === u.id ? 'Opening…' : 'View dashboard'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
