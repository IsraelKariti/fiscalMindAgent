import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type MailboxStatus } from '../api';
import { useT } from '../i18n';

interface Props {
  domain: string;
  onClaimed: (status: MailboxStatus) => void;
}

type Check =
  | { state: 'idle' }
  | { state: 'checking' }
  | { state: 'available'; name: string }
  | { state: 'unavailable'; message: string };

export function ClaimMailbox({ domain, onClaimed }: Props) {
  const { t } = useT();
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
                  ? t.mailboxRulesHint
                  : result.reason === 'reserved'
                    ? t.mailboxReserved
                    : t.mailboxTaken,
            });
          }
        })
        .catch(() => {
          if (seq === checkSeq.current) setCheck({ state: 'idle' });
        });
    }, 300);
    return () => clearTimeout(timer);
  }, [name, t]);

  const claim = async () => {
    if (check.state !== 'available' || claiming) return;
    setClaiming(true);
    setError(null);
    try {
      const { mailbox } = await api.claimMailbox(check.name);
      onClaimed({ claimed: true, emailAddress: mailbox.emailAddress, localPart: mailbox.localPart, domain });
    } catch (err) {
      // Includes the just-taken race (409) — surface it and force a re-check.
      setError(err instanceof ApiError ? err.message : t.mailboxClaimFailed);
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
            dir="ltr"
            autoFocus
            spellCheck={false}
            title={t.mailboxRulesHint}
          />
          <span className="claim-mailbox-domain muted" dir="ltr">@{domain}</span>
        </span>
        <button className="btn btn-primary" type="submit" disabled={check.state !== 'available' || claiming}>
          {claiming ? t.claiming : t.claim}
        </button>
      </form>
      <span className="claim-mailbox-status">
        {error ? (
          <span className="claim-status-bad">{error}</span>
        ) : check.state === 'checking' ? (
          <span className="muted">{t.checking}</span>
        ) : check.state === 'available' ? (
          <span className="claim-status-ok">
            <bdi dir="ltr">{check.name}@{domain}</bdi>
            {t.mailboxAvailableTail}
          </span>
        ) : check.state === 'unavailable' ? (
          <span className="claim-status-bad">{check.message}</span>
        ) : (
          <span className="muted">{t.mailboxRulesHint}</span>
        )}
      </span>
    </div>
  );
}
