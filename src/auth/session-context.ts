// The session React context + hooks, kept in a non-component module so the
// provider file can satisfy react-refresh's component-only-export rule.

import { createContext, useContext } from 'react';
import type { Role, SessionPayload } from '../api/types';

export interface SessionState {
  token: string | null;
  payload: SessionPayload | null;
  roles: Role[];
  expired: boolean; // set when a request returns 401 mid-session
  signIn: (username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionState | null>(null);

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within a SessionProvider');
  return ctx;
}

// Convenience: the token, asserted non-null for authenticated views. Views are
// only rendered behind <RequireAuth>, so the token is present.
export function useToken(): string {
  const { token } = useSession();
  if (!token) throw new Error('no active session');
  return token;
}
