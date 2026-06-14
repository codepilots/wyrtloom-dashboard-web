import { ApiError } from '../api/client';

// Turn any thrown value into a safe, human-readable string. For 403 we present a
// clear "not authorized" message; 401 is handled globally (re-login) but we
// still give a sensible string if it surfaces.
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.isForbidden) {
      return 'Not authorized (403): your role does not permit this action.';
    }
    if (e.isUnauthorized) {
      return 'Session expired (401): please sign in again.';
    }
    return e.message;
  }
  if (e instanceof DOMException && e.name === 'AbortError') return '';
  if (e instanceof Error) return e.message;
  return 'Unexpected error.';
}

export function isForbidden(e: unknown): boolean {
  return e instanceof ApiError && e.isForbidden;
}
