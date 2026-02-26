import { normalizeErrorDetail } from "@/lib/utils";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  token?: string | null;
  workspaceId?: number | null;
  params?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  formData?: FormData;
  signal?: AbortSignal;
};

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const API_BASE_URL_NORMALIZED = API_BASE_URL.endsWith("/") ? API_BASE_URL : `${API_BASE_URL}/`;

function buildUrl(path: string, params?: RequestOptions["params"]): string {
  // Keep API_BASE_URL path segments (e.g. /api on Vercel) even when callers pass "/auth/login".
  const normalizedPath = path.startsWith("/") ? path.slice(1) : path;
  const url = new URL(normalizedPath, API_BASE_URL_NORMALIZED);
  if (!params) return url.toString();

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    url.searchParams.set(key, String(value));
  }
  return url.toString();
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", token, workspaceId, body, formData, params, signal } = options;
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  if (workspaceId) {
    headers["X-Workspace-Id"] = String(workspaceId);
  }

  const init: RequestInit = {
    method,
    headers,
    signal
  };

  if (formData) {
    init.body = formData;
  } else if (body !== undefined) {
    headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(buildUrl(path, params), init);

  if (!response.ok) {
    let message = "Request failed";
    try {
      const payload = await response.json();
      message = normalizeErrorDetail(payload?.detail ?? payload);
    } catch {
      const text = await response.text();
      message = text || message;
    }
    throw new ApiError(response.status, message);
  }

  if (response.status === 204) {
    return {} as T;
  }

  const text = await response.text();
  if (!text) return {} as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    return text as T;
  }
}
