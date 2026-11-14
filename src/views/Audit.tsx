import * as api from '../api/endpoints';
import { useToken } from '../auth/session-context';
import { Banner } from '../components/Banner';
import { JsonTable } from '../components/JsonTable';
import { auditStatuses } from '../lib/auditStatus';
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
        <div className="chain-statuses">
          {auditStatuses(data).map((s) => (
            <div
              key={s.label}
              className={`chain-status ${s.state}`}
              role="status"
            >
              {s.label}: {s.text}
            </div>
          ))}
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
