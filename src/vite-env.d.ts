/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL the SPA uses to reach the API. Defaults to `/api` (same-origin). */
  readonly VITE_API_BASE?: string;
  /** Dev-only: backend target for the `/api` proxy (e.g. http://127.0.0.1:7878). */
  readonly VITE_DEV_API_TARGET?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
