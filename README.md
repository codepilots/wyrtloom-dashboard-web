# wyrtloom-dashboard-web

A React + Vite + TypeScript single-page app that provides a dashboard UI for the
Wyrtloom kanban board and plugin configuration. It is **one client** of the
separate [`wyrtloom-dashboard-api`](../wyrtloom-dashboard-api) service and talks
to it over JSON.

## Views

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

This SPA is a **same-origin, session-only** client. The design follows the
project's security audit:

- **No client secret / API key in the browser.** The SPA does **not** perform the
  API's ed25519 client-auth request signing and embeds **no** API key or bootstrap
  credential. There is nothing secret in the shipped bundle.
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

### Deployment requirement (API side)

Because the browser does not sign requests, the API must be **deployed to trust
this SPA as a same-origin client**. In practice:

- Serve the built SPA and the API under the **same origin** (e.g. a reverse proxy
  that fronts `wyrtloom-dashboard-api` on loopback and serves the static `dist/`
  at the same host), and add that origin to the API's exact-match
  `--cors-origin` allowlist so credentialed session requests are accepted.
- The API's client-application auth layer (TOFU ed25519 signing) is intended for
  non-browser clients that can safely hold a signing key. For the browser client,
  that layer is expected to be satisfied at the trusted edge (e.g. the reverse
  proxy / gateway enrolls and signs on behalf of same-origin SPA traffic), **not**
  inside the browser. Do not ship a signing key to the browser.

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
