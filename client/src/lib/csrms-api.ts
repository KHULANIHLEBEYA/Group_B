// Civic Signal style: API integration keeps request ownership, status, and sensor context explicit.
export type UserRole = "STUDENT" | "STAFF" | "ADMIN";

export type CsrmsUser = {
  id: number;
  username: string;
  email: string;
  first_name?: string;
  last_name?: string;
  role: UserRole;
};

export type CsrmsRequest = {
  id: number;
  reference?: string;
  title: string;
  description?: string;
  category?: string | { id: number; name: string };
  location?: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "PENDING" | "ASSIGNED" | "IN_PROGRESS" | "RESOLVED" | "CANCELLED";
  source?: "USER" | "SYSTEM";
  assigned_to?: CsrmsUser | null;
  created_at?: string;
  updated_at?: string;
};

export type DashboardSummary = {
  pending: number;
  assigned: number;
  in_progress: number;
  resolved: number;
  [key: string]: number;
};

export type CsrmsNotification = {
  id: number;
  title?: string;
  message: string;
  is_read?: boolean;
  created_at?: string;
};

const API_BASE_URL = (import.meta.env.VITE_CSRMS_API_BASE_URL || "http://127.0.0.1:8000/api").replace(/\/$/, "");
const ACCESS_KEY = "csrms_access_token";
const REFRESH_KEY = "csrms_refresh_token";

export class CsrmsApiError extends Error {
  status: number;
  details: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "CsrmsApiError";
    this.status = status;
    this.details = details;
  }
}

export const tokenStore = {
  get access() { return localStorage.getItem(ACCESS_KEY); },
  get refresh() { return localStorage.getItem(REFRESH_KEY); },
  set(access: string, refresh?: string) { localStorage.setItem(ACCESS_KEY, access); if (refresh) localStorage.setItem(REFRESH_KEY, refresh); },
  clear() { localStorage.removeItem(ACCESS_KEY); localStorage.removeItem(REFRESH_KEY); },
};

async function parseResponse(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return text; }
}

async function refreshAccessToken() {
  const refresh = tokenStore.refresh;
  if (!refresh) return false;
  const response = await fetch(`${API_BASE_URL}/auth/refresh/`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ refresh }) });
  if (!response.ok) { tokenStore.clear(); return false; }
  const payload = await response.json();
  tokenStore.set(payload.access, payload.refresh);
  return true;
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const access = tokenStore.access;
  if (access) headers.set("Authorization", `Bearer ${access}`);
  const response = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  if (response.status === 401 && retry && await refreshAccessToken()) return request<T>(path, init, false);
  const payload = await parseResponse(response);
  if (!response.ok) {
    const message = typeof payload === "object" && payload && "detail" in payload ? String(payload.detail) : `CSRMS API request failed (${response.status})`;
    throw new CsrmsApiError(message, response.status, payload);
  }
  return payload as T;
}

export const csrmsApi = {
  baseUrl: API_BASE_URL,
  login: async (username: string, password: string) => { const payload = await request<{ access: string; refresh: string; user?: CsrmsUser }>("/auth/login/", { method: "POST", body: JSON.stringify({ username, password }) }); tokenStore.set(payload.access, payload.refresh); return payload; },
  register: (payload: { username: string; email: string; password: string; first_name?: string; last_name?: string }) => request<CsrmsUser>("/auth/register/", { method: "POST", body: JSON.stringify(payload) }),
  logout: async () => { const refresh = tokenStore.refresh; try { if (refresh) await request("/auth/logout/", { method: "POST", body: JSON.stringify({ refresh }) }, false); } finally { tokenStore.clear(); } },
  me: () => request<CsrmsUser>("/auth/me/"),
  dashboard: () => request<DashboardSummary>("/dashboard/"),
  notifications: () => request<CsrmsNotification[]>("/notifications/"),
  categories: () => request<Array<{ id: number; name: string }>>("/categories/"),
  requests: (query = "") => request<CsrmsRequest[]>(`/requests/${query ? `?${query}` : ""}`),
  request: (id: number) => request<CsrmsRequest>(`/requests/${id}/`),
  createRequest: (payload: Record<string, unknown>) => request<CsrmsRequest>("/requests/", { method: "POST", body: JSON.stringify(payload) }),
  updateRequest: (id: number, payload: Record<string, unknown>) => request<CsrmsRequest>(`/requests/${id}/`, { method: "PUT", body: JSON.stringify(payload) }),
  updateStatus: (id: number, status: string, comment?: string) => request<CsrmsRequest>(`/requests/${id}/status/`, { method: "PATCH", body: JSON.stringify({ status, comment }) }),
  assignRequest: (id: number, assignedTo: number) => request<CsrmsRequest>(`/requests/${id}/assign/`, { method: "POST", body: JSON.stringify({ assigned_to: assignedTo }) }),
  addUpdate: (id: number, comment: string) => request(`/requests/${id}/updates/`, { method: "POST", body: JSON.stringify({ comment }) }),
  history: (id: number) => request(`/requests/${id}/history/`),
  telemetryNetwork: (payload: Record<string, unknown>, deviceKey: string) => request("/telemetry/network/", { method: "POST", headers: { "X-Device-Key": deviceKey }, body: JSON.stringify(payload) }, false),
  telemetryWater: (payload: Record<string, unknown>, deviceKey: string) => request("/telemetry/water/", { method: "POST", headers: { "X-Device-Key": deviceKey }, body: JSON.stringify(payload) }, false),
  telemetryFire: (payload: Record<string, unknown>, deviceKey: string) => request("/telemetry/fire/", { method: "POST", headers: { "X-Device-Key": deviceKey }, body: JSON.stringify(payload) }, false),
};
