import { describe, expect, it } from "vitest";
import type { Dep, Task } from "../../types.js";
import { reflow } from "../reflow.js";
import { criticalTaskIds, taskSlack } from "../critical.js";

const task = (id: string, startMin: number, durationMin: number): Task => ({
  id, planId: "p", groupId: null, kind: "task", name: id, startMin, durationMin, color: null, notes: "",
  sortOrder: 0, status: "pending", actualStartAt: null, actualDoneAt: null, equipment: null, ovenTemp: null,
});
const dep = (a: string, b: string): Dep => ({ planId: "p", predecessorId: a, successorId: b });

describe("critical path", () => {
  // Turkey: out of fridge (60) -> roast (210) -> rest (40) -> carve (20): ends at 330.
  // Potatoes: peel (30, at 150) -> roast (70): ends at 250, so 80 minutes of slack.
  // Gravy (30) after the roast turkey: ends at 300, 30 minutes of slack (carving finishes later).
  const deps = [dep("out", "roast"), dep("roast", "rest"), dep("rest", "carve"), dep("peel", "spuds"), dep("roast", "gravy")];
  const tasks = reflow(
    [task("out", 0, 60), task("roast", 0, 210), task("rest", 0, 40), task("carve", 0, 20), task("peel", 150, 30), task("spuds", 0, 70), task("gravy", 0, 30)],
    deps,
  );

  it("follows the chain that decides when the meal is ready", () => {
    expect(criticalTaskIds(tasks, deps)).toEqual(new Set(["out", "roast", "rest", "carve"]));
  });

  it("works out how long other tasks could slip", () => {
    const slack = taskSlack(tasks, deps);
    expect(slack.get("peel")).toBe(80);
    expect(slack.get("spuds")).toBe(80);
    expect(slack.get("gravy")).toBe(30);
  });

  it("counts a lone task that ends last as critical, and an early one as not", () => {
    expect(criticalTaskIds([task("a", 0, 30), task("b", 10, 10)], [])).toEqual(new Set(["a"]));
  });

  it("marks every task that ends at the same last moment", () => {
    expect(criticalTaskIds([task("a", 0, 30), task("b", 20, 10)], [])).toEqual(new Set(["a", "b"]));
  });

  it("handles an empty plan", () => {
    expect(criticalTaskIds([], [])).toEqual(new Set());
  });
});
