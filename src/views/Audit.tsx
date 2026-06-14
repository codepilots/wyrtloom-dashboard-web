import * as api from '../api/endpoints';
import { useToken } from '../auth/session-context';
import { Banner } from '../components/Banner';
import { JsonTable } from '../components/JsonTable';
import { useAsyncLoad } from '../lib/useAsyncLoad';

export function Audit() {
  const token = useToken();
  const { data, error, loading } = useAsyncLoad(
    () => api.getAudit(token),
    [token],
  );

  return (
    <div>
      <h2>Audit</h2>
      <Banner kind="error" text={error} />
      {data && (
        <div
          className={`chain-status ${data.chain_verified ? 'ok' : 'bad'}`}
          role="status"
        >
          Audit hash-chain:{' '}
          {data.chain_verified ? 'verified ✓' : 'VERIFICATION FAILED ✗'}
        </div>
      )}
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <JsonTable rows={data?.entries ?? []} />
      )}
    </div>
  );
}
