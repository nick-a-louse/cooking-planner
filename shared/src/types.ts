export type PlanMode = "forward" | "backward";
export type PlanStatus = "draft" | "live" | "done";
export type TaskStatus = "pending" | "active" | "done";

export interface Plan {
  id: string;
  name: string;
  mode: PlanMode;
  /** ISO local datetime, e.g. "2026-12-25T13:00". Start time in forward mode, target finish in backward mode. */
  anchorTime: string;
  isTemplate: boolean;
  status: PlanStatus;
  liveStartedAt: string | null;
  /** Goes up by one on every save. A save must quote the revision it was based on (live sync). */
  revision: number;
  /** Minutes of warning before a task starts during a live run (1, 2, 5 or 10). */
  alertLeadMin: number;
  /** This plan's kitchen, for clash warnings. Copied from "My kitchen" when the plan is created. */
  ovens: number;
  hobRings: number;
  /** How many people are cooking, for hands-on overlap warnings. */
  cooks: number;
  createdAt: string;
  updatedAt: string;
}

export interface Group {
  id: string;
  planId: string;
  name: string;
  color: string;
  sortOrder: number;
}

export type TaskKind = "task" | "wait";

export interface Task {
  id: string;
  planId: string;
  groupId: string | null;
  /** "wait" renders as a striped pause bar (e.g. "rest the meat") but schedules like any task. */
  kind: TaskKind;
  name: string;
  /** Offset in minutes on the plan's internal timeline (0 = earliest point). */
  startMin: number;
  /** Duration in whole minutes, >= 1. */
  durationMin: number;
  /** Only used when the task is ungrouped; grouped tasks inherit the group colour. */
  color: string | null;
  notes: string;
  sortOrder: number;
  status: TaskStatus;
  actualStartAt: string | null;
  actualDoneAt: string | null;
  /** Equipment used: "hob", "oven-1", "oven-2", … or null. */
  equipment: string | null;
  /** Oven temperature in °C, when the task uses an oven. */
  ovenTemp: number | null;
  /** Doesn't need anyone's attention while it runs (e.g. roasting). Wait tasks are always hands-off. */
  handsOff: boolean;
}

/** Finish-to-start dependency: successor starts after predecessor ends. */
export interface Dep {
  planId: string;
  predecessorId: string;
  successorId: string;
}

/** The full document the API reads/writes in one shot. */
export interface PlanDoc {
  plan: Plan;
  groups: Group[];
  tasks: Task[];
  deps: Dep[];
}

/** Summary row for the plan list. */
export interface PlanSummary {
  id: string;
  name: string;
  mode: PlanMode;
  anchorTime: string;
  isTemplate: boolean;
  status: PlanStatus;
  updatedAt: string;
}

import { DEFAULT_TASK_COLOR } from "./palette.js";

/** Rendered colour for a task: group colour wins, else own colour, else a neutral default. */
export function taskColor(task: Task, groups: Group[]): string {
  if (task.groupId) {
    const g = groups.find((g) => g.id === task.groupId);
    if (g) return g.color;
  }
  return task.color ?? DEFAULT_TASK_COLOR;
}
