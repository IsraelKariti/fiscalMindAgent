import { useCallback, useEffect, useState } from 'react';
import { api, type Client, type Email, type NextScheduled } from '../api';
import { ClientCard } from './ClientCard';
import { Timeline } from './Timeline';

export function ClientView({ clientId, onClientUpdated }: { clientId: string; onClientUpdated: () => Promise<void> }) {
  const [client, setClient] = useState<Client | null>(null);
  const [nextScheduled, setNextScheduled] = useState<NextScheduled | null>(null);
  const [emails, setEmails] = useState<Email[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [detail, thread] = await Promise.all([api.getClient(clientId), api.listEmails(clientId)]);
      setClient(detail.client);
      setNextScheduled(detail.nextScheduled);
      setEmails(thread.emails);
      setError(null);
    } catch {
      setError('Failed to load client.');
    }
  }, [clientId]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) return <div className="error-banner">{error}</div>;
  if (!client) return <div className="muted">Loading…</div>;

  return (
    <div className="client-view">
      <ClientCard
        client={client}
        onSaved={async (updated) => {
          setClient(updated);
          await onClientUpdated();
        }}
      />
      <Timeline emails={emails} nextScheduled={nextScheduled} goalStatus={client.goal_status} />
    </div>
  );
}
