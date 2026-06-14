// Render a list of opaque backend records as a table. Keys are discovered from
// the union of object keys; values are stringified and rendered as inert text
// (React escapes them) — never as HTML. Non-object entries fall back to a single
// stringified column.

function stringify(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

// Content-derived key so that prepended/reordered entries keep their identity
// across reloads instead of being mis-associated by position (a plain array
// index would reuse the wrong row's DOM when the feed shifts). The index is
// appended only as a tiebreaker for genuinely identical rows.
function rowKey(row: unknown, index: number): string {
  return `${index}:${stringify(row)}`;
}

export function JsonTable({ rows }: { rows: unknown[] }) {
  if (rows.length === 0) {
    return <p className="muted">No entries.</p>;
  }

  const allObjects = rows.every(
    (r) => r !== null && typeof r === 'object' && !Array.isArray(r),
  );

  if (!allObjects) {
    return (
      <table className="data-table">
        <thead>
          <tr>
            <th>value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={rowKey(r, i)}>
              <td className="mono wrap">{stringify(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    );
  }

  const keys: string[] = [];
  for (const r of rows as Record<string, unknown>[]) {
    for (const k of Object.keys(r)) {
      if (!keys.includes(k)) keys.push(k);
    }
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          {keys.map((k) => (
            <th key={k}>{k}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {(rows as Record<string, unknown>[]).map((r, i) => (
          <tr key={rowKey(r, i)}>
            {keys.map((k) => (
              <td key={k} className="mono wrap">
                {stringify(r[k])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
