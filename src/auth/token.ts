// Decode the advisory session payload from the bearer token.
//
// The token is `base64(payload_json).hex(stamp)`. We decode ONLY the payload to
// read the user id and roles for UI affordances (show/hide write actions). This
// is NOT a trust decision: the API ignores the embedded roles and re-fetches the
// user on every request, and all writes are gated server-side (403 handled). We
// do not verify the stamp client-side (we lack the key, by design).

import type { Role, SessionPayload } from '../api/types';

const VALID_ROLES: ReadonlySet<string> = new Set(['Viewer', 'Operator', 'Admin']);

export function decodeSession(token: string): SessionPayload | null {
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const b64 = token.slice(0, dot);
  let json: string;
  try {
    // atob yields a Latin-1 "binary string" (one char per byte). Reassemble the
    // raw bytes and decode as UTF-8 so non-ASCII user_id/nonce values survive.
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    json = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.user_id !== 'string') return null;
  if (typeof obj.exp_unix !== 'number') return null;
  const roles = Array.isArray(obj.roles)
    ? (obj.roles.filter(
        (r): r is Role => typeof r === 'string' && VALID_ROLES.has(r),
      ) as Role[])
    : [];
  return {
    user_id: obj.user_id,
    roles,
    exp_unix: obj.exp_unix,
    nonce: typeof obj.nonce === 'string' ? obj.nonce : '',
  };
}

export function hasRole(roles: Role[], required: Role): boolean {
  // Roles are not hierarchical in the API (Admin does not imply Operator);
  // operators are granted each role they hold. Mirror that here.
  return roles.includes(required);
}

export function canWriteTasks(roles: Role[]): boolean {
  return hasRole(roles, 'Operator');
}

export function isAdmin(roles: Role[]): boolean {
  return hasRole(roles, 'Admin');
}
