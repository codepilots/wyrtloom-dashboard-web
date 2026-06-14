import { useCallback, useEffect, useState } from 'react';
import * as api from '../api/endpoints';
import { useToken, useSession } from '../auth/session-context';
import { canWriteTasks } from '../auth/token';
import { Banner } from '../components/Banner';
import { TaskDrawer } from '../components/TaskDrawer';
import { errorMessage } from '../lib/errors';
import { TASK_STATES, type BoardResponse, type Task } from '../api/types';

export function Board() {
  const token = useToken();
  const { roles } = useSession();
  const canWrite = canWriteTasks(roles);

  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Task | null>(null);

  // Create-task form state.
  const [newTitle, setNewTitle] = useState('');
  const [newDeps, setNewDeps] = useState('');
  const [createMsg, setCreateMsg] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await api.getBoard(token);
      setBoard(res);
      setError('');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Load on mount / when the token changes. The fetch is inlined (rather than
  // calling `load`) with an `active` guard so a late response after unmount /
  // token change is ignored; all setState calls run after an await, satisfying
  // the effect rules. `load` (no guard) backs the manual Refresh/refresh paths.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await api.getBoard(token);
        if (active) {
          setBoard(res);
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

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setCreateMsg('');
    setCreating(true);
    try {
      const deps = newDeps
        .split(',')
        .map((d) => d.trim())
        .filter(Boolean);
      await api.createTask(token, newTitle.trim(), deps);
      setNewTitle('');
      setNewDeps('');
      setCreateMsg('Task created.');
      await load();
    } catch (e) {
      setCreateMsg(errorMessage(e));
    } finally {
      setCreating(false);
    }
  }

  // Refresh the board and, if a task is open in the drawer, refresh its detail.
  const refresh = useCallback(
    async (focusId?: string) => {
      await load();
      if (focusId) {
        try {
          const fresh = await api.getTask(token, focusId);
          setSelected(fresh);
        } catch {
          setSelected(null);
        }
      }
    },
    [load, token],
  );

  async function openTask(id: string) {
    try {
      const t = await api.getTask(token, id);
      setSelected(t);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  return (
    <div className="board-view">
      <div className="board-header">
        <h2>Board</h2>
        <button type="button" className="ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <Banner kind="error" text={error} />

      {canWrite && (
        <form className="create-task" onSubmit={onCreate}>
          <input
            type="text"
            placeholder="New task title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="depends_on (comma-separated task IDs)"
            value={newDeps}
            onChange={(e) => setNewDeps(e.target.value)}
          />
          <button type="submit" disabled={creating || !newTitle.trim()}>
            {creating ? 'Creating…' : 'Create task'}
          </button>
          {createMsg && <span className="muted">{createMsg}</span>}
        </form>
      )}

      {loading && !board ? (
        <p className="muted">Loading board…</p>
      ) : (
        <div className="columns">
          {TASK_STATES.map((state) => {
            const tasks = board?.columns[state] ?? [];
            return (
              <section className="column" key={state}>
                <h3>
                  {state} <span className="count">{tasks.length}</span>
                </h3>
                <div className="cards">
                  {tasks.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      className="card"
                      onClick={() => void openTask(t.id)}
                    >
                      <div className="card-title">{t.title}</div>
                      <div className="card-meta">
                        {t.actor && <span className="tag">{t.actor}</span>}
                        {t.depends_on.length > 0 && (
                          <span className="tag">
                            {t.depends_on.length} dep
                            {t.depends_on.length === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      {t.block_reason && (
                        <div className="card-block">
                          Blocked: {t.block_reason.reason}
                        </div>
                      )}
                    </button>
                  ))}
                  {tasks.length === 0 && (
                    <p className="muted empty">No tasks</p>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {selected && (
        <TaskDrawer
          task={selected}
          canWrite={canWrite}
          onClose={() => setSelected(null)}
          onChanged={() => refresh(selected.id)}
        />
      )}
    </div>
  );
}
