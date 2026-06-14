import { useState } from 'react';
import * as api from '../api/endpoints';
import { useToken } from '../auth/session-context';
import { Banner } from './Banner';
import { errorMessage } from '../lib/errors';
import { TASK_STATES, type Task, type TaskState } from '../api/types';

interface TaskDrawerProps {
  task: Task;
  canWrite: boolean;
  onClose: () => void;
  onChanged: () => void | Promise<void>;
}

function blockedByText(b: Task['block_reason']): string {
  if (!b) return '';
  if ('Human' in b.blocked_by) return `human: ${b.blocked_by.Human}`;
  return `dependency: ${b.blocked_by.Dependency}`;
}

export function TaskDrawer({
  task,
  canWrite,
  onClose,
  onChanged,
}: TaskDrawerProps) {
  const token = useToken();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [to, setTo] = useState<TaskState>(task.state);
  const [reason, setReason] = useState('');
  const [blockReason, setBlockReason] = useState('');

  async function run(action: () => Promise<unknown>) {
    setError('');
    setBusy(true);
    try {
      await action();
      await onChanged();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="drawer-backdrop" onClick={onClose}>
      <aside
        className="drawer"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Task detail"
      >
        <div className="drawer-head">
          <h2>{task.title}</h2>
          <button type="button" className="ghost" onClick={onClose}>
            Close
          </button>
        </div>

        <dl className="detail">
          <dt>ID</dt>
          <dd className="mono">{task.id}</dd>
          <dt>State</dt>
          <dd>{task.state}</dd>
          <dt>Actor</dt>
          <dd>{task.actor ?? '—'}</dd>
          <dt>Created</dt>
          <dd>{task.created_at}</dd>
          <dt>Depends on</dt>
          <dd>
            {task.depends_on.length === 0
              ? '—'
              : task.depends_on.map((d) => (
                  <div key={d} className="mono">
                    {d}
                  </div>
                ))}
          </dd>
          {task.block_reason && (
            <>
              <dt>Block</dt>
              <dd>
                {task.block_reason.reason}{' '}
                <span className="muted">
                  ({blockedByText(task.block_reason)})
                </span>
              </dd>
            </>
          )}
        </dl>

        <h3>History</h3>
        {task.history.length === 0 ? (
          <p className="muted">No history.</p>
        ) : (
          <ol className="history">
            {task.history.map((h, i) => (
              <li key={i}>
                <span className="hist-states">
                  {h.from} → {h.to}
                </span>
                <span className="muted">
                  {' '}
                  by {h.actor} at {h.at}
                </span>
                {h.reason && <div className="hist-reason">{h.reason}</div>}
              </li>
            ))}
          </ol>
        )}

        {canWrite ? (
          <div className="actions">
            <Banner kind="error" text={error} />

            <fieldset disabled={busy}>
              <legend>Transition</legend>
              <select
                value={to}
                onChange={(e) => setTo(e.target.value as TaskState)}
              >
                {TASK_STATES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="reason (optional)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
              <button
                type="button"
                onClick={() =>
                  void run(() =>
                    api.transitionTask(token, task.id, to, reason || undefined),
                  )
                }
              >
                Apply transition
              </button>
            </fieldset>

            <fieldset disabled={busy}>
              <legend>Claim</legend>
              <button
                type="button"
                onClick={() => void run(() => api.claimTask(token, task.id))}
              >
                Claim task
              </button>
            </fieldset>

            <fieldset disabled={busy}>
              <legend>Block</legend>
              <input
                type="text"
                placeholder="block reason"
                value={blockReason}
                onChange={(e) => setBlockReason(e.target.value)}
              />
              <button
                type="button"
                disabled={!blockReason.trim()}
                onClick={() =>
                  void run(() =>
                    api.blockTask(token, task.id, blockReason.trim()),
                  )
                }
              >
                Block task
              </button>
            </fieldset>
          </div>
        ) : (
          <p className="muted">
            Read-only: your role does not permit task actions.
          </p>
        )}
      </aside>
    </div>
  );
}
