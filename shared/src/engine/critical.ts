import type { Dep, Task } from "../types.js";
import { planEndMin } from "./wallclock.js";

/**
 * Slack: how many minutes each task could slip without making the meal later.
 * Works on the plan as scheduled: dependent tasks start when their last predecessor ends,
 * and tasks with no predecessors stay where they were put.
 *
 * Latest finish = the plan's end for a task nothing depends on, otherwise the earliest
 * latest-start of the tasks that follow it; slack = latest start − actual start.
 */
export function taskSlack(tasks: Task[], deps: Dep[]): Map<string, number> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const succs = new Map<string, string[]>();
  for (const d of deps) {
    if (!byId.has(d.predecessorId) || !byId.has(d.successorId)) continue;
    (succs.get(d.predecessorId) ?? succs.set(d.predecessorId, []).get(d.predecessorId)!).push(d.successorId);
  }
  const end = planEndMin(tasks);
  const latestStart = new Map<string, number>();
  const visit = (id: string, seen: Set<string>): number => {
    const known = latestStart.get(id);
    if (known !== undefined) return known;
    if (seen.has(id)) return Infinity; // a cycle (shouldn't happen: links are checked); be safe
    seen.add(id);
    const t = byId.get(id)!;
    const next = succs.get(id) ?? [];
    const latestFinish = next.length === 0 ? end : Math.min(...next.map((s) => visit(s, seen)));
    const ls = latestFinish - t.durationMin;
    latestStart.set(id, ls);
    return ls;
  };
  const slack = new Map<string, number>();
  for (const t of tasks) slack.set(t.id, Math.max(0, visit(t.id, new Set()) - t.startMin));
  return slack;
}

/** The tasks on the critical path: any delay to one of them makes the meal later. */
export function criticalTaskIds(tasks: Task[], deps: Dep[]): Set<string> {
  const slack = taskSlack(tasks, deps);
  return new Set(tasks.filter((t) => slack.get(t.id) === 0).map((t) => t.id));
}
