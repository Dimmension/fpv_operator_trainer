import type { components } from "./schema";

export type ModuleSummary = components["schemas"]["ModuleSummary"];
export type AttemptState = components["schemas"]["AttemptState"];
export type AttemptHistoryItem = components["schemas"]["AttemptHistoryItem"];
export type ShapePlacement = components["schemas"]["ShapePlacement"];

const API_ROOT = import.meta.env.VITE_API_URL ?? "/api/v1";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
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
  start: (moduleCode: "sequential-search" | "visual-memory") =>
    request<AttemptState>("/attempts", {
      method: "POST",
      body: JSON.stringify({ module_code: moduleCode }),
    }),
  attentionAction: (
    id: number,
    action: {
      sequence_number: number;
      selected_number: number;
      grid_position: number;
      elapsed_ms: number;
      reaction_time_ms: number;
    },
  ) =>
    request<AttemptState>(`/attempts/${id}/actions`, {
      method: "POST",
      body: JSON.stringify(action),
    }),
  finish: (id: number) =>
    request<AttemptState>(`/attempts/${id}/finish`, { method: "POST" }),
  memoryAnswer: (
    id: number,
    round: number,
    placements: ShapePlacement[],
    responseTimeMs: number,
  ) =>
    request<AttemptState>(`/attempts/${id}/rounds/${round}/answer`, {
      method: "POST",
      body: JSON.stringify({ placements, response_time_ms: responseTimeMs }),
    }),
};
