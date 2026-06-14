// In-memory session store. The bearer token lives ONLY in React state here —
// it is never written to localStorage/sessionStorage/cookies, so it does not
// survive a reload (the user logs in again) and is not readable by other
// scripts via web storage. This is a deliberate security choice (see README).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { setUnauthorizedHandler } from '../api/client';
import * as api from '../api/endpoints';
import { decodeSession } from './token';
import { SessionContext, type SessionState } from './session-context';
import type { SessionPayload } from '../api/types';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [payload, setPayload] = useState<SessionPayload | null>(null);
  const [expired, setExpired] = useState(false);

  // Mirror the current token in a ref so signOut can read it without a state
  // updater (state updaters must be pure; firing the logout request inside one
  // would double-fire under StrictMode / concurrent rendering). The ref is
  // synced in an effect, not during render.
  const tokenRef = useRef<string | null>(null);
  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  // Drop the token on any 401 and flag the session as expired so the UI can
  // prompt for re-login. Registered once with the API client.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setToken(null);
      setPayload(null);
      setExpired(true);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await api.login(username, password);
    setToken(res.token);
    setPayload(decodeSession(res.token));
    setExpired(false);
  }, []);

  const signOut = useCallback(async () => {
    const current = tokenRef.current;
    // Drop the token locally first, regardless of the server call's outcome.
    setToken(null);
    setPayload(null);
    setExpired(false);
    if (current) {
      // Best-effort server-side revocation; ignore errors (already signed out
      // locally). A 401 here is expected if the token already expired and must
      // not flip `expired` back on, so swallow it rather than routing through
      // the global handler's perception of an interactive request.
      try {
        await api.logout(current);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const value = useMemo<SessionState>(
    () => ({
      token,
      payload,
      roles: payload?.roles ?? [],
      expired,
      signIn,
      signOut,
    }),
    [token, payload, expired, signIn, signOut],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}
