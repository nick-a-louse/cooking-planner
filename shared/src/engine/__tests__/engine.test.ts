import { describe, expect, it } from "vitest";
import type { Dep, Task } from "../../types.js";
import { sanitizeDeps, wouldCreateCycle } from "../cycles.js";
import { derivedTaskIds, reflow } from "../reflow.js";
import { planEndMin, snapDuration, snapMin, wallClock } from "../wallclock.js";

function task(id: string, startMin: number, durationMin: number): Task {
  return {
    id,
    planId: "p",
    groupId: null,
    kind: "task",
    name: id,
    startMin,
    durationMin,
    color: null,
    notes: "",
    sortOrder: 0,
    status: "pending",
    actualStartAt: null,
    actualDoneAt: null,
    equipment: null,
    ovenTemp: null,
  };
}

function dep(predecessorId: string, successorId: string): Dep {
  return { planId: "p", predecessorId, successorId };
}

describe("wouldCreateCycle", () => {
  it("rejects self-dependency", () => {
    expect(wouldCreateCycle([], "a", "a")).toBe(true);
  });

  it("allows a fresh edge", () => {
    expect(wouldCreateCycle([], "a", "b")).toBe(false);
  });

  it("rejects a direct back-edge", () => {
    expect(wouldCreateCycle([dep("a", "b")], "b", "a")).toBe(true);
  });

  it("rejects a transitive cycle a→b→c→a", () => {
    const deps = [dep("a", "b"), dep("b", "c")];
    expect(wouldCreateCycle(deps, "c", "a")).toBe(true);
  });

  it("allows a diamond a→b, a→c, b→d, c→d", () => {
    const deps = [dep("a", "b"), dep("a", "c"), dep("b", "d")];
    expect(wouldCreateCycle(deps, "c", "d")).toBe(false);
  });
});

describe("sanitizeDeps", () => {
  it("drops deps with missing endpoints and cycle-closing edges", () => {
    const deps = [dep("a", "b"), dep("b", "ghost"), dep("b", "a")];
    const kept = sanitizeDeps(deps, new Set(["a", "b"]));
    expect(kept).toEqual([dep("a", "b")]);
  });
});

describe("reflow", () => {
  it("chains: successor starts at predecessor end", () => {
    const tasks = [task("a", 0, 30), task("b", 5, 20)];
    const out = reflow(tasks, [dep("a", "b")]);
    expect(out.find((t) => t.id === "b")!.startMin).toBe(30);
  });

  it("long chain accumulates", () => {
    const tasks = [task("a", 10, 10), task("b", 0, 15), task("c", 0, 5)];
    const out = reflow(tasks, [dep("a", "b"), dep("b", "c")]);
    expect(out.find((t) => t.id === "b")!.startMin).toBe(20);
    expect(out.find((t) => t.id === "c")!.startMin).toBe(35);
  });

  it("diamond: joiner waits for the latest branch", () => {
    const tasks = [task("a", 0, 10), task("b", 0, 40), task("c", 0, 5), task("d", 0, 5)];
    const deps = [dep("a", "b"), dep("a", "c"), dep("b", "d"), dep("c", "d")];
    const out = reflow(tasks, deps);
    expect(out.find((t) => t.id === "d")!.startMin).toBe(50);
  });

  it("root tasks keep manual starts; untouched tasks keep identity", () => {
    const tasks = [task("a", 25, 10), task("x", 99, 1), task("b", 0, 5)];
    const out = reflow(tasks, [dep("a", "b")]);
    expect(out.find((t) => t.id === "a")!.startMin).toBe(25);
    expect(out.find((t) => t.id === "x")).toBe(tasks[1]);
    expect(out.find((t) => t.id === "b")!.startMin).toBe(35);
  });

  it("no deps returns the same array", () => {
    const tasks = [task("a", 0, 10)];
    expect(reflow(tasks, [])).toBe(tasks);
  });
});

describe("derivedTaskIds", () => {
  it("marks successors only", () => {
    const ids = derivedTaskIds([dep("a", "b"), dep("b", "c")]);
    expect(ids.has("a")).toBe(false);
    expect(ids.has("b")).toBe(true);
    expect(ids.has("c")).toBe(true);
  });
});

describe("live", () => {
  it("proposeShift reports lateness and pending downstream tasks", async () => {
    const { proposeShift } = await import("../live.js");
    const tasks = [task("a", 0, 30), task("b", 30, 20), task("c", 50, 10)];
    const deps = [dep("a", "b"), dep("b", "c")];
    const p = proposeShift(tasks, deps, "a", 42);
    expect(p).toEqual({ deltaMin: 12, affectedTaskIds: ["b", "c"] });
  });

  it("proposeShift returns null when on time or nothing downstream", async () => {
    const { proposeShift } = await import("../live.js");
    const tasks = [task("a", 0, 30), task("b", 30, 20)];
    expect(proposeShift(tasks, [dep("a", "b")], "a", 30)).toBeNull();
    expect(proposeShift(tasks, [], "a", 45)).toBeNull();
  });

  it("proposeShift ignores downstream tasks already done", async () => {
    const { proposeShift } = await import("../live.js");
    const done = { ...task("b", 30, 20), status: "done" as const };
    const tasks = [task("a", 0, 30), done];
    expect(proposeShift(tasks, [dep("a", "b")], "a", 40)).toBeNull();
  });

  it("current and next task detection", async () => {
    const { currentTaskIds, nextTaskIds } = await import("../live.js");
    const tasks = [task("a", 0, 30), task("b", 30, 20), task("c", 100, 5)];
    expect([...currentTaskIds(tasks, 10)]).toEqual(["a"]);
    expect([...nextTaskIds(tasks, 10)]).toEqual(["b"]);
    expect([...currentTaskIds(tasks, 40)]).toEqual(["b"]);
    expect([...nextTaskIds(tasks, 40)]).toEqual(["c"]);
  });
});

describe("wallclock", () => {
  it("snaps minutes and durations", () => {
    expect(snapMin(4.4)).toBe(4);
    expect(snapMin(-3)).toBe(0);
    expect(snapDuration(0.2)).toBe(1);
  });

  it("treats an empty or invalid input as the minimum, never NaN", () => {
    expect(snapMin(NaN)).toBe(0);
    expect(snapDuration(NaN)).toBe(1);
    expect(snapDuration(Infinity)).toBe(1);
  });

  it("forward mode maps offset from anchor", () => {
    const d = wallClock(90, "forward", "2026-12-25T13:00", 200);
    expect(d.getHours()).toBe(14);
    expect(d.getMinutes()).toBe(30);
  });

  it("backward mode pins the plan end to the anchor", () => {
    const tasks = [task("a", 0, 60), task("b", 60, 60)];
    const end = planEndMin(tasks);
    expect(end).toBe(120);
    const lastEnd = wallClock(120, "backward", "2026-12-25T18:00", end);
    expect(lastEnd.getHours()).toBe(18);
    expect(lastEnd.getMinutes()).toBe(0);
    const firstStart = wallClock(0, "backward", "2026-12-25T18:00", end);
    expect(firstStart.getHours()).toBe(16);
  });

  it("lengthening the critical chain in backward mode shifts starts earlier", () => {
    const before = wallClock(0, "backward", "2026-12-25T18:00", 120);
    const after = wallClock(0, "backward", "2026-12-25T18:00", 150);
    expect(after.getTime()).toBeLessThan(before.getTime());
  });
});
