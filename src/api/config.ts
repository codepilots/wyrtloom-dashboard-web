// Shared low-level HTTP helpers used by both the central fetch wrapper
// (src/api/client.ts) and the enrollment client (src/crypto/clientKey.ts). Kept
// as a dependency-free leaf module so importing it never forms an import cycle.

// Single source of truth for the API base URL. Default `/api` (same-origin). Set
// VITE_API_BASE only if the API is served from a different path/origin AND that
// origin is on the API's CORS allowlist.
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ??
  '/api';

// Extract a human-readable message from a failed API response. The API returns
// { "error": "<msg>" } on failures; fall back to status text. Shared so every
// caller surfaces server errors identically.
export async function parseError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: unknown };
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // non-JSON body; ignore
  }
  return res.statusText || `HTTP ${res.status}`;
}
