import { describe, expect, it } from "vitest";
import type { Task } from "../../types.js";
import { clashingTaskIds, equipmentClashes, handsOnOverloads } from "../equipment.js";

const task = (id: string, startMin: number, durationMin: number, equipment: string | null, ovenTemp: number | null = null, extra: Partial<Task> = {}): Task => ({
  id, planId: "p", groupId: null, kind: "task", name: id, startMin, durationMin, color: null, notes: "",
  sortOrder: 0, status: "pending", actualStartAt: null, actualDoneAt: null, equipment, ovenTemp, handsOff: false, ...extra,
});
const kitchen = { ovens: 2, hobRings: 2 };

describe("equipment clashes", () => {
  it("flags two dishes in the same oven at different temperatures, for the overlapping stretch", () => {
    const c = equipmentClashes([task("turkey", 0, 120, "oven-1", 180), task("potatoes", 60, 70, "oven-1", 200)], kitchen);
    expect(c).toEqual([{ kind: "oven-temp", oven: 1, taskIds: ["turkey", "potatoes"], fromMin: 60, toMin: 120 }]);
  });

  it("treats any temperature difference as a clash, as agreed", () => {
    expect(equipmentClashes([task("a", 0, 30, "oven-1", 180), task("b", 10, 30, "oven-1", 185)], kitchen)).toHaveLength(1);
  });

  it("is fine with the same temperature, different ovens, no temperature set, or back-to-back tasks", () => {
    expect(equipmentClashes([task("a", 0, 60, "oven-1", 180), task("b", 30, 60, "oven-1", 180)], kitchen)).toEqual([]);
    expect(equipmentClashes([task("a", 0, 60, "oven-1", 180), task("b", 30, 60, "oven-2", 220)], kitchen)).toEqual([]);
    expect(equipmentClashes([task("a", 0, 60, "oven-1", 180), task("b", 30, 60, "oven-1", null)], kitchen)).toEqual([]);
    expect(equipmentClashes([task("a", 0, 60, "oven-1", 180), task("b", 60, 30, "oven-1", 220)], kitchen)).toEqual([]);
  });

  it("flags more hob tasks at once than there are rings, merging one continuous stretch", () => {
    const tasks = [task("gravy", 0, 30, "hob"), task("sprouts", 10, 30, "hob"), task("carrots", 20, 30, "hob"), task("peas", 25, 10, "hob")];
    const c = equipmentClashes(tasks, kitchen);
    expect(c).toHaveLength(1);
    expect(c[0]).toMatchObject({ kind: "hob", count: 4, fromMin: 20, toMin: 35 });
    expect(new Set(c[0].taskIds)).toEqual(new Set(["gravy", "sprouts", "carrots", "peas"]));
  });

  it("is fine when the hob tasks fit the rings", () => {
    expect(equipmentClashes([task("a", 0, 30, "hob"), task("b", 0, 30, "hob"), task("c", 30, 10, "hob")], kitchen)).toEqual([]);
  });

  it("warns about a task in an oven the kitchen doesn't have", () => {
    expect(equipmentClashes([task("a", 0, 30, "oven-2", 180)], { ovens: 1, hobRings: 4 })).toEqual([
      { kind: "missing-oven", oven: 2, taskIds: ["a"] },
    ]);
  });

  it("ignores finished tasks", () => {
    const c = equipmentClashes([task("a", 0, 60, "oven-1", 180, { status: "done" }), task("b", 30, 60, "oven-1", 220)], kitchen);
    expect(c).toEqual([]);
  });

  it("lists the tasks to outline", () => {
    const c = equipmentClashes([task("a", 0, 60, "oven-1", 180), task("b", 30, 60, "oven-1", 220), task("c", 0, 10, null)], kitchen);
    expect(clashingTaskIds(c)).toEqual(new Set(["a", "b"]));
  });
});

describe("hands-on overlaps", () => {
  it("warns when more hands-on tasks overlap than there are cooks", () => {
    const tasks = [task("peel", 0, 30, null), task("trim", 20, 20, null), task("roast", 0, 120, "oven-1", 180, { handsOff: true })];
    expect(handsOnOverloads(tasks, 1)).toEqual([{ taskIds: ["peel", "trim"], count: 2, fromMin: 20, toMin: 30 }]);
    expect(handsOnOverloads(tasks, 2)).toEqual([]);
  });

  it("never counts waits, hands-off tasks or finished tasks", () => {
    const tasks = [
      task("rest", 0, 30, null, null, { kind: "wait" }),
      task("simmer", 0, 30, "hob", null, { handsOff: true }),
      task("done", 0, 30, null, null, { status: "done" }),
      task("carve", 0, 30, null),
    ];
    expect(handsOnOverloads(tasks, 1)).toEqual([]);
  });
});
