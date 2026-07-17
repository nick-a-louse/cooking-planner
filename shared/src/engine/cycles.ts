import type { Dep } from "../types.js";

/**
 * Would adding predecessor→successor create a cycle?
 * DFS from the candidate successor along existing edges; if we can reach
 * the candidate predecessor, the new edge would close a loop.
 */
export function wouldCreateCycle(deps: Dep[], predecessorId: string, successorId: string): boolean {
  if (predecessorId === successorId) return true;
  const out = new Map<string, string[]>();
  for (const d of deps) {
    const list = out.get(d.predecessorId);
    if (list) list.push(d.successorId);
    else out.set(d.predecessorId, [d.successorId]);
  }
  const stack = [successorId];
  const seen = new Set<string>();
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === predecessorId) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const next = out.get(cur);
    if (next) stack.push(...next);
  }
  return false;
}

/** Remove any deps whose endpoints no longer exist, and any that form cycles (defensive load-time cleanup). */
export function sanitizeDeps(deps: Dep[], taskIds: Set<string>): Dep[] {
  const valid = deps.filter((d) => taskIds.has(d.predecessorId) && taskIds.has(d.successorId));
  const kept: Dep[] = [];
  for (const d of valid) {
    if (!wouldCreateCycle(kept, d.predecessorId, d.successorId)) kept.push(d);
  }
  return kept;
}
