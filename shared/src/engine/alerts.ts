import type { Task } from "../types.js";

/**
 * The moments a live run calls for attention:
 * - soon:    a task starts in `leadMin` minutes
 * - start:   a task should start now
 * - end:     a task should be finished
 * - waitEnd: a wait (e.g. resting the meat) is over
 */
export type AlertKind = "soon" | "start" | "end" | "waitEnd";

export interface LiveAlert {
  /** Unique per task, kind and scheduled minute, so a task moved by a shift can alert again. */
  key: string;
  kind: AlertKind;
  taskId: string;
  /** When it's due, in minutes on the plan's live timeline. */
  atMin: number;
}

/** Lead times offered in plan settings, in minutes. */
export const ALERT_LEAD_OPTIONS = [1, 2, 5, 10] as const;
export const DEFAULT_ALERT_LEAD_MIN = 5;

/**
 * Alerts that fall due after `fromMin` and up to and including `toMin`, oldest first.
 * Called on each tick with the previous tick's time, so every moment fires exactly once.
 * Finished tasks raise nothing; a task that has started doesn't get "soon" or "start".
 */
export function alertsBetween(tasks: Task[], fromMin: number, toMin: number, leadMin: number): LiveAlert[] {
  const out: LiveAlert[] = [];
  const add = (kind: AlertKind, task: Task, atMin: number) => {
    if (atMin > fromMin && atMin <= toMin) out.push({ key: `${kind}:${task.id}:${atMin}`, kind, taskId: task.id, atMin });
  };
  for (const t of tasks) {
    if (t.status === "done") continue;
    if (t.status === "pending") {
      if (leadMin > 0) add("soon", t, t.startMin - leadMin);
      add("start", t, t.startMin);
    }
    add(t.kind === "wait" ? "waitEnd" : "end", t, t.startMin + t.durationMin);
  }
  // Oldest first; at the same minute, endings before starts (finish one thing, then begin the next).
  const order: Record<AlertKind, number> = { end: 0, waitEnd: 1, start: 2, soon: 3 };
  return out.sort((a, b) => a.atMin - b.atMin || order[a.kind] - order[b.kind]);
}
