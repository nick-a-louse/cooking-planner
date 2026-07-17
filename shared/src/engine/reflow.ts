import type { Dep, Task } from "../types.js";

/**
 * Recompute start times so every task with predecessors starts at the
 * latest predecessor end (finish-to-start). Root tasks (no predecessors)
 * keep their manual startMin. Kahn topological order; assumes deps are
 * acyclic (guarded by wouldCreateCycle at insert time and sanitizeDeps
 * at load time).
 *
 * Returns a new array; task objects are only copied when their start changes.
 */
export function reflow(tasks: Task[], deps: Dep[]): Task[] {
  if (deps.length === 0) return tasks;

  const byId = new Map(tasks.map((t) => [t.id, t]));
  const preds = new Map<string, string[]>();
  const succs = new Map<string, string[]>();
  for (const d of deps) {
    if (!byId.has(d.predecessorId) || !byId.has(d.successorId)) continue;
    (preds.get(d.successorId) ?? preds.set(d.successorId, []).get(d.successorId)!).push(d.predecessorId);
    (succs.get(d.predecessorId) ?? succs.set(d.predecessorId, []).get(d.predecessorId)!).push(d.successorId);
  }

  const indegree = new Map<string, number>();
  for (const t of tasks) indegree.set(t.id, preds.get(t.id)?.length ?? 0);

  const queue = tasks.filter((t) => indegree.get(t.id) === 0).map((t) => t.id);
  const newStart = new Map<string, number>();
  for (const t of tasks) newStart.set(t.id, t.startMin);

  let head = 0;
  while (head < queue.length) {
    const id = queue[head++];
    const p = preds.get(id);
    if (p && p.length > 0) {
      const start = Math.max(...p.map((pid) => newStart.get(pid)! + byId.get(pid)!.durationMin));
      newStart.set(id, start);
    }
    for (const s of succs.get(id) ?? []) {
      const deg = indegree.get(s)! - 1;
      indegree.set(s, deg);
      if (deg === 0) queue.push(s);
    }
  }

  return tasks.map((t) => {
    const s = newStart.get(t.id)!;
    return s === t.startMin ? t : { ...t, startMin: s };
  });
}

/** Task ids that have at least one predecessor (their start is derived, not draggable). */
export function derivedTaskIds(deps: Dep[]): Set<string> {
  return new Set(deps.map((d) => d.successorId));
}

/** Direct predecessors of a task. */
export function predecessorsOf(taskId: string, deps: Dep[]): string[] {
  return deps.filter((d) => d.successorId === taskId).map((d) => d.predecessorId);
}
