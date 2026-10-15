import { describe, expect, it } from "vitest";
import type { Task } from "../../types.js";
import { alertsBetween } from "../alerts.js";

const task = (id: string, startMin: number, durationMin: number, extra: Partial<Task> = {}): Task => ({
  id, planId: "p", groupId: null, kind: "task", name: id, startMin, durationMin, color: null, notes: "",
  sortOrder: 0, status: "pending", actualStartAt: null, actualDoneAt: null, equipment: null, ovenTemp: null, ...extra,
});
const kinds = (tasks: Task[], from: number, to: number, lead = 5) =>
  alertsBetween(tasks, from, to, lead).map((a) => `${a.kind}:${a.taskId}@${a.atMin}`);

describe("live alerts", () => {
  it("raises soon, start and end for a task, each at its own minute", () => {
    const tasks = [task("roast", 30, 60)];
    expect(kinds(tasks, 0, 25)).toEqual(["soon:roast@25"]);
    expect(kinds(tasks, 25, 30)).toEqual(["start:roast@30"]);
    expect(kinds(tasks, 30, 90)).toEqual(["end:roast@90"]);
  });

  it("fires each moment once across consecutive ticks (window is after-from, up-to-and-including-to)", () => {
    const tasks = [task("a", 10, 5)];
    const ticks = [0, 4.99, 5, 5.01, 9.99, 10, 14.5, 15, 20];
    const all = ticks.slice(1).flatMap((t, i) => kinds(tasks, ticks[i], t));
    expect(all).toEqual(["soon:a@5", "start:a@10", "end:a@15"]);
  });

  it("uses the plan's lead time, and none when it's 0", () => {
    expect(kinds([task("a", 10, 5)], 0, 9, 2)).toEqual(["soon:a@8"]);
    expect(kinds([task("a", 10, 5)], 0, 9, 0)).toEqual([]);
  });

  it("says a wait is over rather than that it should be finished", () => {
    expect(kinds([task("rest", 0, 15, { kind: "wait", status: "active" })], 10, 15)).toEqual(["waitEnd:rest@15"]);
  });

  it("stays quiet for finished tasks, and doesn't announce the start of one already underway", () => {
    expect(kinds([task("done", 10, 5, { status: "done" })], 0, 20)).toEqual([]);
    expect(kinds([task("going", 10, 5, { status: "active" })], 0, 20)).toEqual(["end:going@15"]);
  });

  it("orders by time, endings before starts at the same minute", () => {
    const tasks = [task("next", 20, 10), task("first", 10, 10)];
    expect(kinds(tasks, 19, 20)).toEqual(["end:first@20", "start:next@20"]);
  });

  it("re-alerts a task that was moved by a schedule shift (the key includes the minute)", () => {
    const before = alertsBetween([task("a", 10, 5)], 0, 10, 5).map((a) => a.key);
    const after = alertsBetween([task("a", 12, 5)], 0, 12, 5).map((a) => a.key);
    expect(after.some((k) => !before.includes(k))).toBe(true);
  });
});
