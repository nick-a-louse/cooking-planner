import type { Dep, Task } from "../types.js";

/** Minutes elapsed since the frozen live zero (may be negative before the run reaches offset 0). */
export function nowOffsetMin(liveZeroAt: string, now: Date): number {
  return (now.getTime() - new Date(liveZeroAt).getTime()) / 60_000;
}

/** Wall-clock Date for an internal offset during a live run (frozen forward mapping). */
export function liveWallClock(offsetMin: number, liveZeroAt: string): Date {
  return new Date(new Date(liveZeroAt).getTime() + offsetMin * 60_000);
}

/** Tasks that should be underway right now: scheduled window contains `nowMin` and not yet done. */
export function currentTaskIds(tasks: Task[], nowMin: number): Set<string> {
  return new Set(
    tasks
      .filter((t) => t.status !== "done" && t.startMin <= nowMin && nowMin < t.startMin + t.durationMin)
      .map((t) => t.id),
  );
}

/** The next not-yet-started tasks: the earliest scheduled start strictly after `nowMin`. */
export function nextTaskIds(tasks: Task[], nowMin: number): Set<string> {
  const upcoming = tasks.filter((t) => t.status === "pending" && t.startMin > nowMin);
  if (upcoming.length === 0) return new Set();
  const first = Math.min(...upcoming.map((t) => t.startMin));
  return new Set(upcoming.filter((t) => t.startMin === first).map((t) => t.id));
}

/** All transitive successors of a task that are still pending (candidates for a shift). */
export function downstreamPendingIds(taskId: string, deps: Dep[], tasks: Task[]): string[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const succs = new Map<string, string[]>();
  for (const d of deps) {
    (succs.get(d.predecessorId) ?? succs.set(d.predecessorId, []).get(d.predecessorId)!).push(d.successorId);
  }
  const out: string[] = [];
  const seen = new Set<string>([taskId]);
  const stack = [taskId];
  while (stack.length > 0) {
    for (const s of succs.get(stack.pop()!) ?? []) {
      if (seen.has(s)) continue;
      seen.add(s);
      if (byId.get(s)?.status === "pending") out.push(s);
      stack.push(s);
    }
  }
  return out;
}

export interface ShiftProposal {
  /** Minutes late (positive) or early (negative) the task finished vs schedule. */
  deltaMin: number;
  /** Pending downstream tasks that would move if the schedule is adjusted. */
  affectedTaskIds: string[];
}

/**
 * When a task is marked done at `actualEndMin`, describe the schedule deviation.
 * Pure computation — the UI decides whether to apply it (never automatic).
 */
export function proposeShift(
  tasks: Task[],
  deps: Dep[],
  taskId: string,
  actualEndMin: number,
): ShiftProposal | null {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return null;
  const deltaMin = Math.round(actualEndMin - (task.startMin + task.durationMin));
  if (deltaMin === 0) return null;
  const affected = downstreamPendingIds(taskId, deps, tasks);
  if (affected.length === 0) return null;
  return { deltaMin, affectedTaskIds: affected };
}
