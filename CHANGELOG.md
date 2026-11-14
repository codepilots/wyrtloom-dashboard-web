# Changelog

All notable changes to `wyrtloom-dashboard-web` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The Audit view shows the **audit anchor** status (`anchor_verified` from
  `GET /api/audit`) beside the hash-chain status. A failed anchor is shown as a
  failure even when the chain verifies, which is the dropped-entries case. An API
  server that predates anchoring omits the field; that is shown as "not reported
  by this server", never as verified.

### Security

- Dependency update to clear `npm audit` findings (was 22: 8 high, 14 moderate).
  - `react-router-dom` floor raised to `^7.18.5` (resolves `react-router` 7.18.5),
    fixing the one runtime-shipped advisory set (open redirect via backslash in
    `<Link>`/`useNavigate`, plus SSR/RSC-only issues). `npm audit --omit=dev` is now clean.
  - `vite` → `^8.1.7` and `vitest` → `^4.1.12`; lockfile regenerated, which also
    picks up patched transitive `postcss`, `nanoid`, `zod`, `browserslist`,
    `brace-expansion` and `source-map-js`.
  - **Known residual:** 9 moderate findings from one advisory, `minimatch`
    GHSA-g3hv-75wg-m249 (glob ReDoS), inside the ESLint toolchain. The patch is
    only in `minimatch` 11, but ESLint 10.14 (latest) requires `^10`, and npm's
    suggested "fix" is a breaking downgrade to ESLint 9. It is dev-only (linting
    our own source) and never ships in the bundle; revisit when ESLint moves to
    `minimatch` 11.
- Note: the lockfile was regenerated with npm 11 because npm 10.9.7 crashes
  (`Cannot read properties of null (reading 'edgesOut')`) resolving the vitest
  peer set.

## [0.1.0] - 2026-06-14

### Added

- Initial React + Vite + TypeScript (strict) SPA for the Wyrtloom dashboard,
  consuming the `wyrtloom-dashboard-api` JSON API.
- **Auth**: in-memory session model — `POST /api/login` bearer token held in
  React context only (never `localStorage`/`sessionStorage`/cookies), sent as
  `Authorization: Bearer`; `POST /api/logout` revokes and drops it. No client
  secret or API key in the browser; no request signing.
- **Views**: Login, Board (7 columns, task cards, detail drawer with history,
  create/transition/claim/block actions gated on the Operator role), Plugins
  table, Config (security summary + editable TOML with client-side validation),
  Logs, and Audit (with `chain_verified` status).
- Central `api/client.ts` fetch wrapper injecting the bearer token and centrally
  handling `401` (force re-login) and `403` (not authorized) responses.
- All server-provided strings rendered as inert text; no `dangerouslySetInnerHTML`.
- Configurable API base via `VITE_API_BASE` (default `/api`, same-origin) and a
  dev-only `/api` proxy via `VITE_DEV_API_TARGET`.
- `README.md` (security model + deployment requirements), `LICENSE` (Apache-2.0),
  and this changelog.
