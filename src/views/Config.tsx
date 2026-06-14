import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/endpoints';
import { useToken } from '../auth/session-context';
import { Banner } from '../components/Banner';
import { errorMessage } from '../lib/errors';
import type { SecurityView } from '../api/types';

// Minimal client-side sanity check before sending the TOML to the API. The
// server re-parses and validates TOML authoritatively, so we deliberately do
// NOT attempt to parse TOML here — a naive scanner mis-handles strings,
// multi-line arrays, and triple-quoted values and would false-reject configs
// the server (and we) just round-tripped. We only catch the obvious empty case
// and require at least one `=` so a pointless round-trip is avoided.
function validateToml(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return 'Config must not be empty.';
  if (!trimmed.includes('=')) {
    return 'Config does not contain any key = value assignments.';
  }
  return null;
}

export function Config() {
  const token = useToken();
  const [toml, setToml] = useState('');
  const [security, setSecurity] = useState<SecurityView | null>(null);
  const [error, setError] = useState('');
  const [saveMsg, setSaveMsg] = useState('');
  const [validationError, setValidationError] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getConfig(token);
      setToml(res.toml);
      setSecurity(res.security);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Load on mount / token change. The fetch is inlined (rather than calling
  // `load`) with an `active` guard so a late response after unmount / token
  // change is ignored; all setState calls run after an await. `load` (no guard)
  // backs the manual Reload / post-save paths.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.getConfig(token);
        if (active) {
          setToml(res.toml);
          setSecurity(res.security);
          setError('');
        }
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setSaveMsg('');
    setError('');
    const v = validateToml(toml);
    if (v) {
      setValidationError(v);
      return;
    }
    setValidationError('');
    setSaving(true);
    try {
      await api.putConfig(token, toml);
      setSaveMsg('Config saved.');
      await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="config-view">
      <h2>Config</h2>
      <Banner kind="error" text={error} />

      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <>
          {security && (
            <section className="security-summary">
              <h3>Security policy</h3>
              <dl className="detail">
                <dt>File read prefixes</dt>
                <dd>
                  {security.file_read_prefixes.length
                    ? security.file_read_prefixes.map((p) => (
                        <div key={p} className="mono">
                          {p}
                        </div>
                      ))
                    : '—'}
                </dd>
                <dt>File write prefixes</dt>
                <dd>
                  {security.file_write_prefixes.length
                    ? security.file_write_prefixes.map((p) => (
                        <div key={p} className="mono">
                          {p}
                        </div>
                      ))
                    : '—'}
                </dd>
                <dt>Network allowlist</dt>
                <dd>
                  {security.network_allowlist.length
                    ? security.network_allowlist.map((p) => (
                        <div key={p} className="mono">
                          {p}
                        </div>
                      ))
                    : '—'}
                </dd>
                <dt>Allow shell</dt>
                <dd>{security.allow_shell ? 'yes' : 'no'}</dd>
                <dt>Allow git</dt>
                <dd>{security.allow_git ? 'yes' : 'no'}</dd>
              </dl>
              <p className="muted">
                This summary reflects the parsed policy. Edit the raw TOML below
                (including per-plugin enabled / settings / capabilities) and save
                to apply.
              </p>
            </section>
          )}

          <form onSubmit={onSave} className="config-form">
            <label>
              Configuration (TOML)
              <textarea
                value={toml}
                spellCheck={false}
                onChange={(e) => {
                  setToml(e.target.value);
                  setValidationError('');
                  setSaveMsg('');
                }}
                rows={24}
              />
            </label>
            <Banner kind="error" text={validationError} />
            <Banner kind="success" text={saveMsg} />
            <div className="row">
              <button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Save config'}
              </button>
              <button
                type="button"
                className="ghost"
                onClick={() => void load()}
                disabled={saving}
              >
                Reload
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
