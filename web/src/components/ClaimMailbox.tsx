import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type MailboxStatus } from '../api';

interface Props {
  domain: string;
  onClaimed: (status: MailboxStatus) => void;
}

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; name: string }
  | { state: 'unavailable'; message: string };

const RULES_HINT = '3–30 characters: lowercase letters, digits and hyphens (not at the edges).';

export function ClaimMailbox({ domain, onClaimed }: Props) {
  const [name, setName] = useState('');
  const [check, setCheck] = useState<Check>({ state: 'idle' });
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkSeq = useRef(0);

  // Debounced availability check; a sequence counter drops out-of-order responses.
  useEffect(() => {
    setError(null);
    if (!name) {
      setCheck({ state: 'idle' });
      return;
    }
    setCheck({ state: 'checking' });
    const seq = ++checkSeq.current;
    const timer = setTimeout(() => {
      api
        .mailboxAvailability(name)
        .then((result) => {
          if (seq !== checkSeq.current) return;
          if (result.available) {
            setCheck({ state: 'available', name: result.name });
          } else {
            setCheck({
              state: 'unavailable',
              message:
                result.reason === 'invalid'
                  ? RULES_HINT
                  : result.reason === 'reserved'
                    ? 'That name is reserved.'
                    : 'That name is already taken.',
            });
          }
        })
        .catch(() => {
          if (seq === checkSeq.current) setCheck({ state: 'idle' });
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [name]);

  const claim = async () => {
    if (check.state !== 'available' || claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const { mailbox } = await api.claimMailbox(check.name);
      onClaimed({ claimed: true, emailAddress: mailbox.emailAddress, localPart: mailbox.localPart, domain });
    } catch (err) {
      // Includes the just-taken race (409) — surface it and force a re-check.
      setError(err instanceof ApiError ? err.message : 'Could not claim the name. Try again.');
      setCheck({ state: 'idle' });
      setClaiming(false);
    }
  };

  return (
    <div className="claim-mailbox">
      <form
        className="claim-mailbox-form"
        onSubmit={(e) => {
          e.preventDefault();
          claim();
        }}
      >
        <span className="claim-mailbox-field">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.toLowerCase().trim())}
            placeholder="your-agent-name"
            autoFocus
            spellCheck={false}
            title={RULES_HINT}
          />
          <span className="claim-mailbox-domain muted">@{domain}</span>
        </span>
        <button className="btn btn-primary" type="submit" disabled={check.state !== 'available' || claiming}>
          {claiming ? 'Claiming…' : 'Claim'}
        </button>
      </form>
      <span className="claim-mailbox-status">
        {error ? (
          <span className="claim-status-bad">{error}</span>
        ) : check.state === 'checking' ? (
          <span className="muted">Checking…</span>
        ) : check.state === 'available' ? (
          <span className="claim-status-ok">
            {check.name}@{domain} is available. This is permanent — it can't be changed later.
          </span>
        ) : check.state === 'unavailable' ? (
          <span className="claim-status-bad">{check.message}</span>
        ) : (
          <span className="muted">{RULES_HINT}</span>
        )}
      </span>
    </div>
  );
}
