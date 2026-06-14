// Central fetch wrapper for the wyrtloom-dashboard-api.
//
// Security model (see README): the browser is a SAME-ORIGIN client that holds
// the bearer session token IN MEMORY only (never localStorage/sessionStorage)
// and sends it as `Authorization: Bearer <token>`. It is ALSO a real signing
// client: every request (except /enroll) carries a P-256 client signature in
// the x-wyrtloom-* headers, computed from a NON-EXTRACTABLE WebCrypto key (see
// src/crypto/clientKey.ts). The signing key never leaves the browser.
//
// 401 (auth/session expired) and 403 (RBAC) are surfaced as typed errors so the
// UI can route to re-login or show "not authorized" without leaking detail.

import { signRequest } from '../crypto/clientKey';
import { API_BASE, parseError } from './config';

// Reused for both signing the body and parsing JSON error envelopes; one
// module-level encoder avoids re-allocating per request.
const textEncoder = new TextEncoder();

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

// Build the request URL. Query values MUST be passed via `query` here so they go
// through `URLSearchParams` and never hand-concatenated into `path`: the signed
// bytes are computed over the EXACT encoded `path + query` string that is sent
// (see `signedPath` and `request`), so a hand-built query that encodes
// differently from what `URLSearchParams`/the browser ultimately sends would
// produce a signed-vs-sent mismatch and a self-inflicted 401. Exported for the
// round-trip interop test in src/crypto/ (do not change its encoding lightly).
export function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = `${API_BASE}${path}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== '') params.set(k, v);
  }
  const qs = params.toString();
  return qs ? `${url}?${qs}` : url;
}

// The path + query the server canonicalizes over (it uses the request URI's
// path_and_query), so query parameters are integrity-protected. We resolve
// relative URLs against the page origin to extract a clean `pathname + search`
// regardless of whether API_BASE is `/api` or absolute. The returned string is
// signed AND is the path portion of the URL we fetch, so the signed bytes are
// over the exact `pathname + search` sent — this is why queries must be built
// via `buildUrl`/`URLSearchParams` and never hand-concatenated (a divergent
// encoding would sign one string and send another → self-inflicted 401). The
// round-trip invariant is locked by the test in src/crypto/. Exported for it.
export function signedPath(url: string): string {
  const u = new URL(url, window.location.origin);
  return u.pathname + u.search;
}

export async function request<T>(
  path: string,
  token: string | null,
  opts: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  // Serialise the body to a string first so we can both send it and hash its
  // exact bytes for the client signature (the server signs over the raw body).
  let bodyText = '';
  if (opts.rawBody !== undefined) {
    bodyText = opts.rawBody;
    headers['Content-Type'] = opts.contentType ?? 'text/plain';
  } else if (opts.json !== undefined) {
    bodyText = JSON.stringify(opts.json);
    headers['Content-Type'] = 'application/json';
  }
  const hasBody = opts.rawBody !== undefined || opts.json !== undefined;
  const bodyBytes = textEncoder.encode(bodyText);
  const method = opts.method ?? 'GET';
  const fullUrl = buildUrl(path, opts.query);

  // Honor an already-aborted signal before doing any work: signing is async
  // (IndexedDB load + WebCrypto) and would otherwise complete and emit a fully
  // signed request — consuming a server nonce — for a request the caller has
  // already abandoned.
  if (opts.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }

  // Attach the P-256 client signature over the canonical request. Signed across
  // the full URL PATH + QUERY STRING (the server canonicalizes over the request
  // URI's path_and_query) and the exact body bytes — matching the server's
  // canonicalizer. Do NOT strip the query here: it is integrity-protected, so
  // dropping it would break signing for requests like `GET /api/board?states=`.
  // We derive the path from the resolved request URL so
  // it matches what the server sees, whether API_BASE is `/api` or a full
  // origin. /enroll is the one route that is NOT signed (it is how a brand-new
  // client first authorizes), but it never flows through here.
  const sig = await signRequest(method, signedPath(fullUrl), bodyBytes);

  // Re-check after the async signing window; if aborted meanwhile, drop it
  // rather than sending a now-unwanted signed request.
  if (opts.signal?.aborted) {
    throw new DOMException('The operation was aborted.', 'AbortError');
  }
  headers['x-wyrtloom-client'] = sig.clientId;
  headers['x-wyrtloom-timestamp'] = sig.timestamp;
  headers['x-wyrtloom-nonce'] = sig.nonce;
  headers['x-wyrtloom-signature'] = sig.signatureHex;

  let res: Response;
  try {
    res = await fetch(fullUrl, {
      method,
      headers,
      body: hasBody ? bodyText : undefined,
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
