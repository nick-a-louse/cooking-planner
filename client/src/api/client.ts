import type { Kitchen, PlanDoc, PlanSummary } from "@cookplan/shared";

/** A failed API call. `body` is the server's JSON reply, e.g. { error, doc } on a 409. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  // Only label the request as JSON when it actually carries a body: Fastify rejects
  // a request that says "application/json" but sends nothing (e.g. DELETE) with a 400.
  const headers = init?.body !== undefined ? { "Content-Type": "application/json" } : undefined;
  const res = await fetch(url, { ...init, headers: { ...headers, ...init?.headers } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    throw new ApiError((body.error as string) ?? `${res.status} ${res.statusText}`, res.status, body);
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
  /** Server-sent events for one plan: "plan" after every save, "deleted" when it's removed. */
  planEventsUrl: (id: string) => `/api/plans/${id}/events`,
  deletePlan: (id: string) => request<void>(`/api/plans/${id}`, { method: "DELETE" }),
  getKitchen: () => request<Kitchen>("/api/settings/kitchen"),
  saveKitchen: (k: Kitchen) => request<Kitchen>("/api/settings/kitchen", { method: "PUT", body: JSON.stringify(k) }),
  clonePlan: (id: string, opts: { name?: string; asTemplate?: boolean; anchorTime?: string } = {}) =>
    request<PlanDoc>(`/api/plans/${id}/clone`, { method: "POST", body: JSON.stringify(opts) }),
};
