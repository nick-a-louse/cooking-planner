import type { PlanMode, Task } from "../types.js";

/** Snap a minute value to whole minutes, clamped at 0 (an empty or invalid input gives 0). */
export function snapMin(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Snap a duration to whole minutes with a 1-minute floor (an empty or invalid input gives 1). */
export function snapDuration(value: number): number {
  return Number.isFinite(value) ? Math.max(1, Math.round(value)) : 1;
}

/** End of the plan on the internal timeline (latest task end), 0 for an empty plan. */
export function planEndMin(tasks: Task[]): number {
  return tasks.reduce((max, t) => Math.max(max, t.startMin + t.durationMin), 0);
}

/**
 * Map an internal-timeline minute offset to a wall-clock Date.
 * Forward mode: anchor is the plan start, time flows forward from it.
 * Backward mode: anchor is the target finish; the latest-finishing task ends exactly at the anchor.
 */
export function wallClock(
  offsetMin: number,
  mode: PlanMode,
  anchorTime: string,
  endMin: number,
): Date {
  const anchor = new Date(anchorTime);
  const deltaMin = mode === "forward" ? offsetMin : offsetMin - endMin;
  return new Date(anchor.getTime() + deltaMin * 60_000);
}

/** Format a Date as HH:MM (24h). */
export function formatHM(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Format a duration in minutes as e.g. "1h 20m" or "45m". */
export function formatDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}
