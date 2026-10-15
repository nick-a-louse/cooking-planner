import { describe, expect, it } from "vitest";
import { emptyHistory, record, redo, undo } from "../../history.js";

describe("undo/redo history", () => {
  it("undoes and redoes in order", () => {
    let h = emptyHistory<string>();
    h = record(h, "a"); // a -> b
    h = record(h, "b"); // b -> c
    let cur = "c";
    let step = undo(h, cur)!;
    expect(step.value).toBe("b");
    ({ value: cur, history: h } = step);
    ({ value: cur, history: h } = undo(h, cur)!);
    expect(cur).toBe("a");
    expect(undo(h, cur)).toBeNull();
    ({ value: cur, history: h } = redo(h, cur)!);
    ({ value: cur, history: h } = redo(h, cur)!);
    expect(cur).toBe("c");
    expect(redo(h, cur)).toBeNull();
  });

  it("forgets the redo list once a new edit is made", () => {
    let h = record(record(emptyHistory<string>(), "a"), "b");
    const { history } = undo(h, "c")!; // back to b, c is redoable
    h = record(history, "b"); // new edit b -> d
    expect(redo(h, "d")).toBeNull();
  });

  it("keeps only the most recent 50 steps", () => {
    let h = emptyHistory<number>();
    for (let i = 0; i < 60; i++) h = record(h, i);
    expect(h.past).toHaveLength(50);
    expect(h.past[0]).toBe(10);
  });
});
