// Shared TypeScript shapes mirroring the wyrtloom-dashboard-api JSON contract.
// Source of truth: wyrtloom-dashboard-api/src/routes.rs and the wyrtloom-core
// kanban / users crates. All strings are server-provided and rendered inert.

export type Role = 'Viewer' | 'Operator' | 'Admin';

export const TASK_STATES = [
  'Backlog',
  'Todo',
  'Ready',
  'Running',
  'Blocked',
  'Done',
  'Archived',
] as const;

export type TaskState = (typeof TASK_STATES)[number];

// BlockedBy is a serde externally-tagged enum: { "Human": "<actor>" } |
// { "Dependency": "<task-uuid>" }.
export type BlockedBy = { Human: string } | { Dependency: string };

export interface BlockReason {
  reason: string;
  blocked_by: BlockedBy;
}

export interface StateChange {
  from: TaskState;
  to: TaskState;
  actor: string;
  at: string; // Timestamp(DateTime<Utc>) serialises to an RFC3339 string.
  reason: string | null;
}

export interface Task {
  id: string;
  title: string;
  state: TaskState;
  actor: string | null;
  depends_on: string[];
  block_reason: BlockReason | null;
  history: StateChange[];
  created_at: string;
}

// GET /api/board → { columns: { "<State>": Task[] } }
export interface BoardResponse {
  columns: Partial<Record<TaskState, Task[]>>;
}

// POST /api/login → { token, exp_unix }
export interface LoginResponse {
  token: string;
  exp_unix: number;
}

// The base64-decoded session payload embedded in the bearer token. The API
// treats embedded roles as advisory (it re-fetches on every request), so we
// only use them to decide which UI affordances to show — never as a security
// boundary; every write is still gated server-side and 403s are handled.
export interface SessionPayload {
  user_id: string;
  roles: Role[];
  exp_unix: number;
  nonce: string;
}

export interface SecurityView {
  file_read_prefixes: string[];
  file_write_prefixes: string[];
  network_allowlist: string[];
  allow_shell: boolean;
  allow_git: boolean;
}

// GET /api/config → { toml, security }
export interface ConfigResponse {
  toml: string;
  security: SecurityView;
}

export interface PluginManifest {
  name: string;
  version: string;
  class: string;
  enabled: boolean;
  capabilities: string;
}

// GET /api/plugins → { plugins: PluginManifest[] }
export interface PluginsResponse {
  plugins: PluginManifest[];
}

// GET /api/logs → { logs: unknown[] } (logger entry shape is backend-defined).
export interface LogsResponse {
  logs: unknown[];
}

// GET /api/audit → { chain_verified, entries }
export interface AuditResponse {
  chain_verified: boolean;
  entries: unknown[];
}
