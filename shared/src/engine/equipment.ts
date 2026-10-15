import type { Task } from "../types.js";

/**
 * Kitchen equipment a task can use. A task uses at most one item:
 * "hob" (any free ring) or "oven-1", "oven-2", … (a specific oven, with a temperature).
 */
export type Equipment = "hob" | `oven-${number}`;

export interface Kitchen {
  ovens: number;
  hobRings: number;
}

export const DEFAULT_KITCHEN: Kitchen = { ovens: 1, hobRings: 4 };
export const MAX_OVENS = 4;
export const MAX_HOB_RINGS = 8;

/** The oven number a task uses, or null. */
export function ovenOf(task: Task): number | null {
  const m = task.equipment?.match(/^oven-(\d+)$/);
  return m ? Number(m[1]) : null;
}

/** "Oven" when the kitchen has one, otherwise "Oven 2" etc. */
export function ovenLabel(n: number, ovens: number): string {
  return ovens <= 1 ? "Oven" : `Oven ${n}`;
}

export type Clash =
  /** Two tasks share an oven at the same time but need different temperatures. */
  | { kind: "oven-temp"; oven: number; taskIds: [string, string]; fromMin: number; toMin: number }
  /** More hob tasks at once than there are rings. */
  | { kind: "hob"; taskIds: string[]; count: number; fromMin: number; toMin: number }
  /** A task uses an oven the plan's kitchen doesn't have (e.g. after reducing the count). */
  | { kind: "missing-oven"; oven: number; taskIds: [string] };

const end = (t: Task) => t.startMin + t.durationMin;
/** Half-open intervals: one task ending as another starts is not an overlap. */
const overlap = (a: Task, b: Task) => a.startMin < end(b) && b.startMin < end(a);

/**
 * Every equipment clash in a plan, earliest first. Warnings only: the plan can still be saved and run.
 * Finished tasks are left out (they no longer need the equipment).
 */
export function equipmentClashes(tasks: Task[], kitchen: Kitchen): Clash[] {
  const active = tasks.filter((t) => t.status !== "done" && t.equipment);
  const clashes: Clash[] = [];

  // Ovens: any overlap at two different temperatures. A task with no temperature set can't clash on it.
  const inOven = active.filter((t) => ovenOf(t) !== null);
  for (const t of inOven) {
    const n = ovenOf(t)!;
    if (n > kitchen.ovens) clashes.push({ kind: "missing-oven", oven: n, taskIds: [t.id] });
  }
  for (let i = 0; i < inOven.length; i++) {
    for (let j = i + 1; j < inOven.length; j++) {
      const a = inOven[i];
      const b = inOven[j];
      if (ovenOf(a) !== ovenOf(b) || !overlap(a, b)) continue;
      if (a.ovenTemp == null || b.ovenTemp == null || a.ovenTemp === b.ovenTemp) continue;
      const [first, second] = a.startMin <= b.startMin ? [a, b] : [b, a];
      clashes.push({
        kind: "oven-temp",
        oven: ovenOf(a)!,
        taskIds: [first.id, second.id],
        fromMin: Math.max(a.startMin, b.startMin),
        toMin: Math.min(end(a), end(b)),
      });
    }
  }

  // Hob: more pans at once than rings.
  for (const o of overloads(active.filter((t) => t.equipment === "hob"), kitchen.hobRings)) clashes.push({ kind: "hob", ...o });

  const startOf = (c: Clash) => ("fromMin" in c ? c.fromMin : -Infinity);
  return clashes.sort((x, y) => startOf(x) - startOf(y));
}

export interface Overload {
  taskIds: string[];
  /** The most running at once during the stretch. */
  count: number;
  fromMin: number;
  toMin: number;
}

/**
 * Stretches of time when more of these tasks run at once than `capacity` allows (hob rings, cooks…).
 * Sweeps through the start and end points; one continuous over-capacity stretch is reported once.
 */
export function overloads(tasks: Task[], capacity: number): Overload[] {
  const out: Overload[] = [];
  const points = [...new Set(tasks.flatMap((t) => [t.startMin, end(t)]))].sort((x, y) => x - y);
  let open: { ids: Set<string>; count: number; fromMin: number; toMin: number } | null = null;
  const close = () => {
    if (open) out.push({ taskIds: [...open.ids], count: open.count, fromMin: open.fromMin, toMin: open.toMin });
    open = null;
  };
  for (let k = 0; k < points.length - 1; k++) {
    const [from, to] = [points[k], points[k + 1]];
    const running = tasks.filter((t) => t.startMin <= from && end(t) >= to);
    if (running.length <= capacity) {
      close();
      continue;
    }
    if (open && open.toMin === from) {
      running.forEach((t) => open!.ids.add(t.id));
      open.count = Math.max(open.count, running.length);
      open.toMin = to;
    } else {
      close();
      open = { ids: new Set(running.map((t) => t.id)), count: running.length, fromMin: from, toMin: to };
    }
  }
  close();
  return out;
}

/** Does this task need someone's hands? Waits never do; other tasks unless marked hands-off. */
export function isHandsOn(task: Task): boolean {
  return task.kind !== "wait" && !task.handsOff;
}

/** Stretches when more hands-on tasks overlap than there are cooks. Finished tasks are left out. */
export function handsOnOverloads(tasks: Task[], cooks: number): Overload[] {
  return overloads(
    tasks.filter((t) => t.status !== "done" && isHandsOn(t)),
    cooks,
  );
}

/** Ids of every task involved in at least one clash, for outlining on the timeline. */
export function clashingTaskIds(clashes: Clash[]): Set<string> {
  return new Set(clashes.flatMap((c) => c.taskIds));
}
