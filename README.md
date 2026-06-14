# wyrtloom-dashboard-web

A React + Vite + TypeScript single-page app that provides a dashboard UI for the
Wyrtloom kanban board and plugin configuration. It is **one client** of the
separate [`wyrtloom-dashboard-api`](../wyrtloom-dashboard-api) service and talks
to it over JSON.

## Views

- **Enroll** (first run only) — before the app can call the API, this browser
  registers itself as a signing client. It generates a **non-extractable**
  WebCrypto ECDSA P-256 keypair, stores it in IndexedDB, and `POST`s its public
  key to `/api/enroll` with an operator-supplied **single-use bootstrap API
  key**. The operator obtains this key from the server (the API / `clientauth`
  layer issues single-use enrollment keys). The bootstrap key is used **once**
  and is never persisted by the app. After enrollment every request is signed
  (see security model below); this screen does not appear again on this device.
- **Login** — username/password sign-in. The returned bearer session token is
  held **in memory only** (see security model below).
- **Board** — the 7 kanban columns (Backlog → Todo → Ready → Running → Blocked →
  Done → Archived). Task cards show title, actor, dependency count, and block
  reason. A detail drawer shows the full task history and (for Operators) actions
  to **transition**, **claim**, and **block** a task. Operators can also create
  tasks. Write actions are hidden when the signed-in user lacks the Operator role
  and any server `403` is surfaced clearly.
- **Plugins** — a manifest/capability table (name, version, class, enabled,
  capabilities).
- **Config** (Admin) — a structured read-only summary of the security policy plus
  an editable raw-TOML form with client-side sanity checks, backed by
  `GET|PUT /api/config`. The server re-parses and validates authoritatively.
- **Logs** (Admin) — the call-logger entries as a table.
- **Audit** (Admin) — the audit entries plus the `chain_verified` status returned
  by the API's `verify_chain`.

A top nav exposes the views the user's role can use. `401` (session expired) and
`403` (not authorized) are handled globally: a `401` drops the in-memory token
and routes back to login with a notice; a `403` shows an inline "not authorized"
message.

## Security model (important)

This SPA is a **same-origin** client that is **also a real request-signing
client**. The design follows the project's security audit:

- **No secret in the shipped bundle.** No API key, bootstrap credential, or
  signing key is baked into the build. The bootstrap API key is entered by the
  operator at runtime, used once for enrollment, and never persisted.
- **Non-extractable client signing key.** On first run the SPA generates an
  ECDSA **P-256** keypair with `extractable: false` and stores the
  `CryptoKeyPair` (plus the server-assigned `client_id`) in **IndexedDB**.
  Non-extractable keys are structured-cloneable and survive reloads, yet their
  private bytes can **never** be read back — even XSS can only ask the browser to
  sign, not exfiltrate the key. This satisfies the API's client-auth layer
  (`wyrtloom-clientauth-tofu`), which verifies a P-256 signature on every
  non-enroll route.
- **Per-request P-256 signatures.** Every request except `/api/enroll` (including
  the ClientOnly `/api/login`) carries four lowercase headers:
  `x-wyrtloom-client` (client_id), `x-wyrtloom-timestamp` (Unix seconds),
  `x-wyrtloom-nonce` (fresh random per request), and `x-wyrtloom-signature`
  (lowercase hex of the 64-byte raw r‖s signature). The signature is computed
  over a length-prefixed canonical message (`src/crypto/canonical.ts`) covering
  the method, full URL **path + query string** (the server canonicalizes over the
  request URI's `path_and_query`, so the query is signed too), SHA-256 of the
  body, client_id, timestamp, and nonce — byte-for-byte matching the Rust server. The golden
  interop vector is asserted by `src/crypto/canonical.test.ts` (`npm test`).
- **Session token in memory only.** `POST /api/login {username,password}` returns
  a bearer token, which is kept in React state/context and sent as
  `Authorization: Bearer <token>`. It is **never** written to `localStorage`,
  `sessionStorage`, or cookies, so it does not survive a reload and is not exposed
  to other scripts via web storage. `POST /api/logout` revokes it server-side and
  it is dropped locally.
- **Roles are advisory in the UI.** The token payload's roles are decoded only to
  decide which affordances to show. They are **not** a security boundary: the API
  re-fetches the user and enforces RBAC on every request, and every write is still
  gated server-side (handled `403`s).
- **No XSS sinks.** All server-provided strings (task titles, history, config
  values, log/audit detail) are rendered as inert text — React escapes them. The
  app uses **no** `dangerouslySetInnerHTML`.

### Security response headers (serving layer)

`index.html` ships a `Content-Security-Policy` `<meta>` tag as a defense-in-depth
fallback. The serving layer (reverse proxy / static host fronting the SPA) **should
also** send these as HTTP **response headers**, which are more robust than the
meta tag:

- `Content-Security-Policy: default-src 'self'; script-src 'self'; object-src
  'none'; base-uri 'none'; frame-ancestors 'none'`
- `X-Content-Type-Options: nosniff`

Note that `frame-ancestors` is **only** honored when delivered via a response
header — the `<meta>` form is ignored for that directive — so the header is
required to actually deny framing/clickjacking.

### Deployment requirement (API side)

- Serve the built SPA and the API under the **same origin** (e.g. a reverse proxy
  that fronts `wyrtloom-dashboard-api` on loopback and serves the static `dist/`
  at the same host), and add that origin to the API's exact-match
  `--cors-origin` allowlist so credentialed session requests are accepted.
- The API's client-application auth layer (`wyrtloom-clientauth-tofu`) is
  satisfied **directly by the browser**: the SPA enrolls its non-extractable
  P-256 key and signs each request itself. No edge signing component is needed,
  and no signing key is shipped in the bundle — the key is generated in, and
  never leaves, the browser. The operator must hand the first-run user a
  single-use bootstrap API key to complete enrollment.

`VITE_API_BASE` controls the base URL the SPA calls (default `/api`,
same-origin). Point it elsewhere **only** if that origin is on the API's CORS
allowlist.

## Configuration

| Variable              | Default | Purpose                                                        |
|-----------------------|---------|----------------------------------------------------------------|
| `VITE_API_BASE`       | `/api`  | Base URL for API requests (same-origin by default).            |
| `VITE_DEV_API_TARGET` | (unset) | Dev-only proxy target for `/api`, e.g. `http://127.0.0.1:7878`. |

Copy `.env.example` to `.env.local` (gitignored) to set these for local dev.

## Develop / build

Node 22 + npm.

```sh
npm install

# Dev server (set VITE_DEV_API_TARGET in .env.local to proxy /api to a backend)
npm run dev

# Type-check + production build → dist/
npm run build

# Lint
npm run lint

# Type-check only
npx tsc --noEmit
```

## License

Apache-2.0. See [LICENSE](LICENSE).
