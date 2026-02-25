const TOKEN_KEY = "opspilot_token";
const WORKSPACE_KEY = "opspilot_workspace_id";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function getWorkspaceId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(WORKSPACE_KEY);
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

export function setWorkspaceId(workspaceId: number): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WORKSPACE_KEY, String(workspaceId));
}

export function clearWorkspaceId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(WORKSPACE_KEY);
}
