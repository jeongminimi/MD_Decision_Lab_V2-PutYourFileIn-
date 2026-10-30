import type { ActionOutcome, ActionRecord, ActionType, DashboardSummary, ProductAnalysis } from "./types";

import { apiFetch } from "./http";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.detail || "요청을 처리하지 못했습니다.");
  }
  return response.json() as Promise<T>;
}

export const api = {
  dashboard: () => request<DashboardSummary>("/api/dashboard"),
  products: (q = "", risk = "all") => request<ProductAnalysis[]>(`/api/products?q=${encodeURIComponent(q)}&risk=${risk}`),
  actions: () => request<ActionRecord[]>("/api/actions"),
  createAction: (productId: number, actionType: ActionType, note: string) =>
    request<ActionRecord>("/api/actions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product_id: productId, action_type: actionType, note }) }),
  completeAction: (id: number) => request<ActionRecord>(`/api/actions/${id}/complete`, { method: "POST" }),
  actionOutcome: (id: number) => request<ActionOutcome>(`/api/actions/${id}/outcome`),
  importSales: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ imported: number; rejected: number; messages: string[] }>("/api/import/sales", { method: "POST", body });
  },
  importProducts: (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return request<{ imported: number; rejected: number; messages: string[] }>("/api/import/products", { method: "POST", body });
  },
};
