import type { PlanDoc, PlanSummary } from "@cookplan/shared";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Only label the request as JSON when it actually carries a body: Fastify rejects
  // a request that says "application/json" but sends nothing (e.g. DELETE) with a 400.
  const headers = init?.body !== undefined ? { "Content-Type": "application/json" } : undefined;
  const res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).error ?? `${res.status} ${res.statusText}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  listPlans: () => request<PlanSummary[]>("/api/plans"),
  createPlan: (name: string) =>
    request<PlanDoc>("/api/plans", { method: "POST", body: JSON.stringify({ name }) }),
  getPlan: (id: string) => request<PlanDoc>(`/api/plans/${id}`),
  savePlan: (doc: PlanDoc) =>
    request<PlanDoc>(`/api/plans/${doc.plan.id}`, { method: "PUT", body: JSON.stringify(doc) }),
  deletePlan: (id: string) => request<void>(`/api/plans/${id}`, { method: "DELETE" }),
  clonePlan: (id: string, opts: { name?: string; asTemplate?: boolean; anchorTime?: string } = {}) =>
    request<PlanDoc>(`/api/plans/${id}/clone`, { method: "POST", body: JSON.stringify(opts) }),
};
