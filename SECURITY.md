# Security model — wyrtloom-dashboard-web

This document describes the security model of the `wyrtloom-dashboard-web` SPA: a
React + Vite + TypeScript single-page app that is **one client** of the separate
`wyrtloom-dashboard-api` service. Cited files are authoritative; this document
summarizes them.

## Threat model & scope

**What this is.** A browser SPA that signs in a user, holds a session bearer
token, and acts as a per-device request-signing client of the dashboard API. It
is served same-origin with the API and talks to it over JSON.

**Trust boundary.** The browser is an **UNTRUSTED execution environment**. Any
code that runs in the page — including injected/XSS code — runs with the same DOM
and Web API access as the app itself. The security model therefore assumes the
client can be compromised and pushes the real authorization boundary to the
server. The SPA's job is to (a) raise the cost of credential theft, (b) keep
secrets out of the shipped bundle, and (c) prove client identity on every request
so a stolen session token alone is not sufficient.

**In scope:**
- Protecting the client signing key against exfiltration (even under XSS).
- Keeping the session token out of any persistent / cross-script-readable store.
- Keeping all secrets out of the build artifact.
- Per-request integrity (method + path + query + body) via signatures.
- Reducing the XSS attack surface (sinks, CSP).

**Out of scope / delegated to the server:**
- **Authorization (RBAC).** The server is authoritative; UI role gating is
  advisory only.
- Replay protection, timestamp/nonce validation, low-s signature enforcement —
  the client cooperates (sends nonce/timestamp, normalizes low-s) but the server
  enforces.
- Transport security (TLS), CORS allowlisting, and sending response-header CSP —
  owned by the serving/proxy layer.

**Assumed adversaries:** a network attacker (mitigated by same-origin + TLS at the
serving layer), a stolen-token attacker (mitigated by per-request signing with a
non-extractable key the token-holder cannot reproduce off-device), and injected
script / XSS (mitigated but **not eliminated** — see Gotchas).

## Security mechanisms

### 1. Non-extractable WebCrypto P-256 signing key

On first run the SPA generates an ECDSA **P-256** keypair with
`extractable: false` (`src/crypto/clientKey.ts`, `generateKeyPair`:
`crypto.subtle.generateKey(KEYGEN_PARAMS, false, ['sign'])`). The
`CryptoKeyPair` and the server-assigned `client_id` are persisted in **IndexedDB**
as a structured-clone `CryptoKey` (`StoredIdentity`, `idbPut`/`idbGet`), so the
client identity survives reloads.

Because the private key is non-extractable, JavaScript in the page (including XSS)
can ask the browser to **sign** with it (`crypto.subtle.sign`, used in
`signRequest`) but can **never** read the raw private bytes back out. Only the
**public** key is ever exported — once, at enrollment, as the 65-byte SEC1
uncompressed point (`exportPublicKeyB64`, `crypto.subtle.exportKey('raw', ...)`).

### 2. Session token in memory only

The bearer session token returned by `POST /api/login` lives **only** in React
state/context (`src/auth/SessionContext.tsx`: `const [token, setToken] =
useState<string | null>(null)`). It is **never** written to `localStorage`,
`sessionStorage`, or cookies. (Verified: the only occurrences of those identifiers
in `src/` are comments in `SessionContext.tsx` and `api/client.ts` documenting the
choice — there are no writes.)

Consequences:
- The token does not survive a reload (the user logs in again).
- It is not readable by other scripts via web storage.
- It is dropped on logout (`signOut` clears state before/after best-effort
  server revocation via `POST /api/logout`) and dropped on **any 401**: the API
  client invokes the registered unauthorized handler
  (`src/api/client.ts`, `onUnauthorized`), which clears the token and flags the
  session expired (`SessionContext.tsx`, `setUnauthorizedHandler` effect).

The token sent as `Authorization: Bearer <token>` (`api/client.ts`). It is also
decoded **client-side for UI only** (`src/auth/token.ts`, `decodeSession`) — see
mechanism 6.

### 3. No secrets in the bundle

No API key, bootstrap credential, or signing key is baked into the build. The
client signing key is **generated in the browser** and never imported. The
**single-use bootstrap API key** required for first-run enrollment is entered by
the operator at runtime (`src/auth/EnrollGate.tsx`, password input), passed once
to `enroll()` (`src/crypto/clientKey.ts`), and **never persisted** — `EnrollGate`
clears it from component state immediately after use (`setApiKey('')`), and the
enroll flow stores only `{ client_id, keyPair }`, never the bootstrap key.

### 4. Per-request P-256 request signing

Every request **except** `/api/enroll` carries a P-256 signature over a
byte-exact canonical message (`src/api/client.ts`, `request()` calls
`signRequest`; the enroll POST in `clientKey.ts` is the one unsigned route — it is
how a brand-new client first authorizes, and it does not flow through the central
`request()` wrapper).

The canonical message (`src/crypto/canonical.ts`, `buildCanonicalBytes`) is a
length-prefixed encoding — a domain tag `wyrtloom-client-auth-v1` then each field
written as an 8-byte big-endian length prefix followed by raw bytes — covering, in
fixed order: method, **full path + query string**, SHA-256 of the body, client_id,
timestamp (i64 Unix seconds, big-endian), and nonce. It MUST match the Rust server
**byte-for-byte**; a golden interop vector is asserted by
`src/crypto/canonical.test.ts` (`npm test`).

Key integrity details:
- **The query string is signed** — `signedPath()` in `api/client.ts` derives
  `pathname + search` from the resolved URL and does not strip the query (the
  server canonicalizes over the request URI's `path_and_query`).
- The signature is sent as four lowercase headers: `x-wyrtloom-client`,
  `x-wyrtloom-timestamp`, `x-wyrtloom-nonce` (fresh 16 random bytes per request,
  `freshNonce`), and `x-wyrtloom-signature` (lowercase hex of the 64-byte raw
  r‖s signature).
- Signing is gated on abort: `request()` checks `opts.signal?.aborted` both
  before and after the async signing window so an abandoned request does not
  consume a server nonce.

### 5. Low-s signature normalization (mandatory)

WebCrypto emits ECDSA signatures with a high `s` value roughly half the time. The
server enforces **canonical low-s** (anti-malleability), so the client must
normalize before sending. `normalizeLowS` (`src/crypto/clientKey.ts`) parses the
64-byte r‖s signature and, if `s > n/2` (P-256 group order `n`), replaces `s` with
`n − s` (r unchanged). Both forms verify the same message, but the server only
accepts the low-s form, so this normalization is **required for every signed
request**, not optional hardening.

### 6. Server-authoritative authorization (roles advisory only)

The token is `base64(payload_json).hex(stamp)`. `decodeSession`
(`src/auth/token.ts`) decodes **only the payload** to read `user_id` and `roles`
to decide which UI affordances to show (`canWriteTasks`, `isAdmin`). This is
explicitly **not a trust decision**: the stamp is not verified client-side (the
app lacks the key, by design), the API ignores the embedded roles and re-fetches
the user, and **every write is re-checked server-side**. Note roles are not
hierarchical (`hasRole` — Admin does not imply Operator), mirroring the server.

Error routing surfaces 401 vs 403 as typed `ApiError`s (`api/client.ts`,
`isUnauthorized` / `isForbidden`):
- **401** → drop token, force re-login (global handler), without treating bad
  login credentials as an expired session (`skipUnauthorizedHandler` for
  login/logout).
- **403** → surfaced as "not authorized" without leaking detail.

### 7. XSS hygiene & CSP

- **No XSS sinks.** No `dangerouslySetInnerHTML`, `innerHTML`, or `eval` anywhere
  in `src/` (verified by grep). All server-provided strings (task titles,
  history, config/log/audit detail) are rendered as inert text — React escapes
  them.
- **CSP `<meta>`** in `index.html` as defense-in-depth:
  `default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none';
  frame-ancestors 'none'`.
- **Same-origin fetch** with `credentials: 'same-origin'` on every request
  (`api/client.ts`, `clientKey.ts`) — ambient credentials are never sent
  cross-origin.

## Key decisions & rationale

- **Signing key non-extractable in IndexedDB, not a software key in JS memory.**
  A non-extractable `CryptoKey` is structured-cloneable and survives reloads while
  its private bytes are unreadable — so a page compromise cannot exfiltrate a
  reusable credential, only abuse it transiently while resident.
- **Token in memory, not web storage or a cookie.** Web storage is readable by
  any script (XSS-exfiltratable) and survives reloads; a cookie would be sent
  ambiently and reintroduce CSRF. In-memory state minimizes lifetime and exposure
  and ties the token's life to the tab.
- **No secrets in the build.** Anything in the bundle is world-readable; the
  bootstrap key is operator-supplied at runtime and used exactly once.
- **Server-authoritative RBAC.** The browser cannot be trusted to enforce
  authorization; client role checks exist only to avoid showing affordances that
  would 403, improving UX without being a boundary.
- **Per-request signing over the full canonical request.** Binds method, path,
  query, and body so a stolen bearer token alone cannot forge or tamper with a
  request without the device's signing key; nonce + timestamp give the server
  replay protection.
- **Low-s normalization client-side.** Kept deliberately in sync with the
  server's canonical-signature enforcement.

## Gotchas / watch-outs

- **XSS can USE the signing key even though it cannot steal it.** Non-extractable
  means the raw private key can never be exported, but in-page script can still
  call `crypto.subtle.sign` and have the browser sign **arbitrary** requests for
  as long as it runs. The non-extractable key raises the bar (no durable stolen
  credential) but does **not** eliminate XSS-driven abuse. Keeping the CSP strict
  and the number of XSS sinks at zero is therefore load-bearing, not optional.

- **The serving layer must ALSO send security response headers.** The CSP in
  `index.html` is a `<meta>` **fallback**. The reverse proxy / static host
  fronting the SPA should send, as HTTP **response headers**:
  `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src
  'none'; base-uri 'none'; frame-ancestors 'none'` and
  `X-Content-Type-Options: nosniff`. Critically, **`frame-ancestors` is only
  honored via a response header** — the `<meta>` form is ignored for it — so
  without the header there is no actual clickjacking/framing protection.

- **Single-origin assumption.** The SPA and API are served same-origin and all
  fetches use `credentials: 'same-origin'`. Do **not** relax CORS to a broader
  allowlist and do **not** move the session token into a cookie — a cookie would
  be sent ambiently and reintroduce CSRF, which the in-memory-bearer +
  same-origin design specifically avoids. If `VITE_API_BASE` is pointed at
  another origin, that origin must be on the API's exact-match CORS allowlist.

- **P-256 low-s normalization is mandatory and version-coupled.** It must stay in
  sync with the server's canonical low-s enforcement and with the canonical
  encoder (`canonical.ts` / `wyrtloom-client-auth-v1`). The golden interop test
  (`canonical.test.ts`) guards the encoder; if the server changes its canonical
  form or signature policy, both must change together or every signed request will
  be rejected.

- **A failed IndexedDB identity read must not look like "not enrolled."**
  `EnrollGate.tsx` treats a read failure (storage blocked, private browsing,
  transient error) as an explicit `unavailable` state, **not** as "needs
  enrollment" — re-enrolling would overwrite and permanently destroy the existing
  non-extractable keypair the server already trusts.

## Referenced files

- `src/crypto/clientKey.ts` — key generation, IndexedDB persistence, enrollment,
  request signing, low-s normalization.
- `src/crypto/canonical.ts` — byte-exact canonical request encoder.
- `src/api/client.ts` — central fetch wrapper, signing integration, token header,
  401/403 handling, same-origin credentials.
- `src/auth/SessionContext.tsx`, `src/auth/session-context.ts` — in-memory session
  state, token drop on logout/401.
- `src/auth/token.ts` — advisory (UI-only) session/role decoding.
- `src/auth/EnrollGate.tsx` — first-run enrollment, bootstrap-key handling,
  unavailable-state safety.
- `index.html` — CSP `<meta>` fallback.
- `README.md` — narrative security model.
