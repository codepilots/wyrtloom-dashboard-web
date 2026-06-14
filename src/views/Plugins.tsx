import * as api from '../api/endpoints';
import { useToken } from '../auth/session-context';
import { Banner } from '../components/Banner';
import { useAsyncLoad } from '../lib/useAsyncLoad';

export function Plugins() {
  const token = useToken();
  const { data, error, loading } = useAsyncLoad(
    () => api.getPlugins(token),
    [token],
  );
  const plugins = data?.plugins ?? [];

  return (
    <div>
      <h2>Plugins</h2>
      <Banner kind="error" text={error} />
      {loading ? (
        <p className="muted">Loading…</p>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Version</th>
              <th>Class</th>
              <th>Enabled</th>
              <th>Capabilities</th>
            </tr>
          </thead>
          <tbody>
            {plugins.map((p) => (
              <tr key={p.name}>
                <td>{p.name}</td>
                <td className="mono">{p.version}</td>
                <td>{p.class}</td>
                <td>{p.enabled ? 'yes' : 'no'}</td>
                <td className="mono wrap">{p.capabilities}</td>
              </tr>
            ))}
            {plugins.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No plugins configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
