import type { components } from "./schema";

export type ModuleSummary = components["schemas"]["ModuleSummary"];
export type AttemptState = components["schemas"]["AttemptState"];
export type AttemptHistoryItem = components["schemas"]["AttemptHistoryItem"];
export type ShapePlacement = components["schemas"]["ShapePlacement"];

export type ModuleCode = 
  | "sequential-search" 
  | "visual-memory" 
  | "attention-endurance" 
  | "divided-attention"
  | "attention-switching"
  | "fine-motor-skills"
  | "nervous-system";

const API_ROOT = import.meta.env.VITE_API_URL ?? "/api/v1"; 

export function getAuthToken(): string | null {
  return localStorage.getItem("fpv_auth_token");
}

export function setAuthToken(token: string) {
  localStorage.setItem("fpv_auth_token", token);
}

export function removeAuthToken() {
  localStorage.removeItem("fpv_auth_token");
}

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...init?.headers as Record<string, string>,
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
  
  if (response.status === 401) {
    removeAuthToken();
    window.dispatchEvent(new Event("auth-expired"));
    throw new ApiError("Сессия истекла", 401);
  }

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { detail?: string } | null;
    throw new ApiError(body?.detail ?? "Не удалось выполнить запрос", response.status);
  }
  return response.json() as Promise<T>;
}

export const api = {
  modules: () => request<ModuleSummary[]>("/modules"),
  history: () => request<AttemptHistoryItem[]>("/attempts"),
  attempt: (id: number) => request<AttemptState>(`/attempts/${id}`),
  
  login: (data: any) => request<any>("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  register: (data: any) => request<any>("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  getMe: () => request<any>("/auth/me"),

  start: (moduleCode: ModuleCode) =>
    request<AttemptState>("/attempts", {
      method: "POST",
      body: JSON.stringify({ module_code: moduleCode }),
    }),
    
  finish: (id: number) =>
    request<AttemptState>(`/attempts/${id}/finish`, { method: "POST" }),
    
  attentionAction: (id: number, action: any) =>
    request<AttemptState>(`/attempts/${id}/actions`, {
      method: "POST", body: JSON.stringify(action),
    }),
    
  memoryAnswer: (id: number, round: number, placements: ShapePlacement[], responseTimeMs: number) =>
    request<AttemptState>(`/attempts/${id}/rounds/${round}/answer`, {
      method: "POST", body: JSON.stringify({ placements, response_time_ms: responseTimeMs }),
    }),
    
  correctionAction: (id: number, sequence_number: number, position: number, selected: boolean) =>
    request<AttemptState>(`/attempts/${id}/correction/actions`, {
      method: "POST", body: JSON.stringify({ sequence_number, position, selected }),
    }),
    
  recall: (id: number, statements: string[]) =>
    request<AttemptState>(`/attempts/${id}/recall`, {
      method: "POST", body: JSON.stringify({ statements }),
    }),

  switchingAction: (id: number, action: { sequence_number: number; position: number; elapsed_ms: number; reaction_time_ms: number }) =>
    request<AttemptState>(`/attempts/${id}/switching/actions`, {
      method: "POST", body: JSON.stringify(action)
    }),

  motorSubmit: (id: number, data: { 
      total_time_ms: number; 
      time_out_of_line_ms: number; 
      error_count: number; 
      smoothness_score: number;
      path_length_px: number;
      velocity_px_s: number;
    }) =>
      request<AttemptState>(`/attempts/${id}/motor/submit`, {
        method: "POST", body: JSON.stringify(data)
      }),

  tappingSubmit: (id: number, intervals: number[]) =>
    request<AttemptState>(`/attempts/${id}/tapping/submit`, {
      method: "POST", body: JSON.stringify({ intervals })
    }),
};