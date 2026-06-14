import { useEffect, useState } from 'react';
import { errorMessage } from './errors';

// Load an async resource on mount and whenever `deps` change. Returns the data,
// a human-readable error string, a loading flag, and a `reload` to re-run.
//
// Guards against setting state after unmount / a stale run via an `active` flag,
// and runs all setState calls after an await so React's effect rules are
// satisfied (no synchronous cascading render).
export function useAsyncLoad<T>(
  loader: () => Promise<T>,
  deps: readonly unknown[],
): {
  data: T | null;
  error: string;
  loading: boolean;
  reload: () => Promise<void>;
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  // Bumping this re-runs the effect on demand (reload).
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await loader();
        if (active) {
          setData(res);
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
    // `loader` is intentionally not a dep: callers pass a fresh closure each
    // render, so we key re-runs on the explicit `deps` + the reload `tick`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  const reload = async () => {
    setTick((t) => t + 1);
  };

  return { data, error, loading, reload };
}
