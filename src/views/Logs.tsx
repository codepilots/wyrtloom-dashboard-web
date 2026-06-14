import * as api from '../api/endpoints';
import { useToken } from '../auth/session-context';
import { Banner } from '../components/Banner';
import { JsonTable } from '../components/JsonTable';
import { useAsyncLoad } from '../lib/useAsyncLoad';

export function Logs() {
  const token = useToken();
  const { data, error, loading } = useAsyncLoad(
    () => api.getLogs(token),
    [token],
  );

  return (
    <div>
      <h2>Logs</h2>
      <Banner kind="error" text={error} />
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <JsonTable rows={data?.logs ?? []} />
      )}
    </div>
  );
}
