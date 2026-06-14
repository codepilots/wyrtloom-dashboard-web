// Central fetch wrapper for the wyrtloom-dashboard-api.
//
// Security model (see README): the browser is a SAME-ORIGIN, SESSION-ONLY
// client. It holds the bearer session token IN MEMORY only (never
// localStorage/sessionStorage) and sends it as `Authorization: Bearer <token>`.
// It does NOT sign requests with a client key and embeds no API key/secret.
//
// 401 (auth/session expired) and 403 (RBAC) are surfaced as typed errors so the
// UI can route to re-login or show "not authorized" without leaking detail.

const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ??
  '/api';

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
  get isUnauthorized(): boolean {
    return this.status === 401;
  }
  get isForbidden(): boolean {
    return this.status === 403;
  }
}

export interface RequestOptions {
  method?: string;
  // `json` is serialised as an application/json body.
  json?: unknown;
  // `rawBody` is sent verbatim (used for PUT /api/config, which takes TOML).
  rawBody?: string;
  contentType?: string;
  query?: Record<string, string | undefined>;
  signal?: AbortSignal;
  // When true, a 401 does NOT trigger the global re-login handler. Used by the
  // login/logout endpoints: a 401 there means bad credentials or an already-gone
  // session, not an expired in-app session, so it must not flip the UI into the
  // "your session expired" state.
  skipUnauthorizedHandler?: boolean;
}

// Callback invoked whenever any request comes back 401, so the session context
// can drop the token and force re-login. Registered once at app start.
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

async function parseError(res: Response): Promise<string> {
  // The API returns { "error": "<msg>" } on failures. Fall back to status text.
  try {
    const body = (await res.json()) as { error?: unknown };
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // non-JSON body; ignore
  }
  return res.statusText || `HTTP ${res.status}`;
}

export async function request<T>(
  path: string,
  token: string | null,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
    headers['Content-Type'] = opts.contentType ?? 'text/plain';
  } else if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? 'GET',
      headers,
      body,
      signal: opts.signal,
      // Same-origin only; never send ambient credentials cross-origin.
      credentials: 'same-origin',
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw e;
    throw new ApiError(0, 'network error: could not reach the API');
  }

  if (res.status === 401) {
    // Session expired or invalid → force re-login (unless the caller opted out,
    // e.g. login/logout, where a 401 is not an expired in-app session).
    if (onUnauthorized && !opts.skipUnauthorizedHandler) onUnauthorized();
    throw new ApiError(401, await parseError(res));
  }
  if (!res.ok) {
    throw new ApiError(res.status, await parseError(res));
  }

  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}
