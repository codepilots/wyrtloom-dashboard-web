// Typed endpoint wrappers over the central `request` client. Each takes the
// in-memory bearer token (or null for login) explicitly — there is no ambient
// global token store, keeping the secret confined to React state.

import { request } from './client';
import type {
  AuditResponse,
  BoardResponse,
  ConfigResponse,
  LoginResponse,
  LogsResponse,
  PluginsResponse,
  Task,
  TaskState,
} from './types';

export function login(
  username: string,
  password: string,
): Promise<LoginResponse> {
  return request<LoginResponse>('/login', null, {
    method: 'POST',
    json: { username, password },
    skipUnauthorizedHandler: true,
  });
}

export function logout(token: string): Promise<void> {
  return request<void>('/logout', token, {
    method: 'POST',
    skipUnauthorizedHandler: true,
  });
}

export function getBoard(
  token: string,
  states?: TaskState[],
): Promise<BoardResponse> {
  return request<BoardResponse>('/board', token, {
    query: { states: states && states.length ? states.join(',') : undefined },
  });
}

export function getTask(token: string, id: string): Promise<Task> {
  return request<Task>(`/tasks/${encodeURIComponent(id)}`, token);
}

export function createTask(
  token: string,
  title: string,
  dependsOn: string[],
): Promise<{ id: string }> {
  return request<{ id: string }>('/tasks', token, {
    method: 'POST',
    json: { title, depends_on: dependsOn },
  });
}

export function transitionTask(
  token: string,
  id: string,
  to: TaskState,
  reason?: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/tasks/${encodeURIComponent(id)}/transition`,
    token,
    { method: 'POST', json: { to, reason: reason || null } },
  );
}

export function claimTask(
  token: string,
  id: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/tasks/${encodeURIComponent(id)}/claim`,
    token,
    { method: 'POST' },
  );
}

export function blockTask(
  token: string,
  id: string,
  reason: string,
): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(
    `/tasks/${encodeURIComponent(id)}/block`,
    token,
    { method: 'POST', json: { reason } },
  );
}

export function getConfig(token: string): Promise<ConfigResponse> {
  return request<ConfigResponse>('/config', token);
}

export function putConfig(token: string, toml: string): Promise<void> {
  return request<void>('/config', token, {
    method: 'PUT',
    rawBody: toml,
    // The API parses the body as TOML; send it as text.
    contentType: 'text/plain',
  });
}

export function getPlugins(token: string): Promise<PluginsResponse> {
  return request<PluginsResponse>('/plugins', token);
}

export function getLogs(token: string): Promise<LogsResponse> {
  return request<LogsResponse>('/logs', token);
}

export function getAudit(token: string): Promise<AuditResponse> {
  return request<AuditResponse>('/audit', token);
}
