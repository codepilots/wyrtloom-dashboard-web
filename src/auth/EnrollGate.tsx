// First-run enrollment gate. Before the app can talk to the API at all, this
// browser must have an enrolled client identity (a non-extractable P-256 keypair
// + server-assigned client_id in IndexedDB). If none exists, we show a one-field
// screen asking the operator for a single-use bootstrap API key and enroll.
//
// The bootstrap key is used once for enroll and is NEVER persisted by this app.
// The private signing key is non-extractable and lives only in IndexedDB.

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { enroll, hasIdentity } from '../crypto/clientKey';
import { Banner } from '../components/Banner';
import { errorMessage } from '../lib/errors';

type Status = 'checking' | 'needed' | 'ready' | 'unavailable';

export function EnrollGate({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>('checking');
  const [apiKey, setApiKey] = useState('');
  const [clientName, setClientName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    hasIdentity()
      .then((enrolled) => {
        if (active) setStatus(enrolled ? 'ready' : 'needed');
      })
      .catch(() => {
        // CRITICAL: a failed identity read (IndexedDB blocked/locked, private
        // mode, transient error) must NOT be treated as "not enrolled" — doing
        // so would prompt a re-enroll that overwrites and permanently destroys
        // an existing non-extractable keypair the server already trusts. Show an
        // explicit unavailable state instead so the user can retry safely.
        if (active) setStatus('unavailable');
      });
    return () => {
      active = false;
    };
  }, []);

  const onSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      setError('');
      setBusy(true);
      try {
        await enroll(
          apiKey.trim(),
          clientName.trim() || 'wyrtloom-dashboard-web',
        );
        // Drop the bootstrap key from component state once consumed.
        setApiKey('');
        setStatus('ready');
      } catch (err) {
        setError(errorMessage(err) || 'Enrollment failed.');
      } finally {
        setBusy(false);
      }
    },
    [apiKey, clientName],
  );

  if (status === 'checking') {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Wyrtloom</h1>
          <p className="muted">Checking client enrollment…</p>
        </div>
      </div>
    );
  }

  if (status === 'unavailable') {
    return (
      <div className="login-shell">
        <div className="login-card">
          <h1>Wyrtloom</h1>
          <Banner
            kind="error"
            text="Could not read this browser's client identity (storage may be unavailable, e.g. private browsing). Reload to retry. Do not re-enroll unless you are sure this device has never enrolled — re-enrolling replaces the stored signing key."
          />
          <button type="button" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (status === 'needed') {
    return (
      <div className="login-shell">
        <form className="login-card" onSubmit={onSubmit}>
          <h1>Wyrtloom</h1>
          <p className="muted">Enroll this browser as an API client</p>
          <p className="muted">
            This device needs a single-use bootstrap API key from the server
            operator to register its signing key. The key is used once and never
            stored.
          </p>
          <Banner kind="error" text={error} />
          <label>
            Client name (optional)
            <input
              type="text"
              autoComplete="off"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="wyrtloom-dashboard-web"
            />
          </label>
          <label>
            Bootstrap API key
            <input
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              required
              autoFocus
            />
          </label>
          <button type="submit" disabled={busy || !apiKey.trim()}>
            {busy ? 'Enrolling…' : 'Enroll'}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}
