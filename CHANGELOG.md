# Changelog

All notable changes to `wyrtloom-dashboard-web` are documented here. This project
adheres to [Semantic Versioning](https://semver.org/).

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
