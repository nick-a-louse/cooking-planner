/** Undo/redo history of snapshots: `past` ends with the most recent, `future` starts with the next redo. */
export interface History<T> {
  past: T[];
  future: T[];
}

/** How many edits can be undone. */
export const HISTORY_LIMIT = 50;

export const emptyHistory = <T>(): History<T> => ({ past: [], future: [] });

/** Remember `before` (the state just before an edit). A new edit clears the redo list. */
export function record<T>(h: History<T>, before: T, limit = HISTORY_LIMIT): History<T> {
  return { past: [...h.past, before].slice(-limit), future: [] };
}

/** Step back: returns the state to show and the new history, or null if there's nothing to undo. */
export function undo<T>(h: History<T>, current: T): { value: T; history: History<T> } | null {
  if (h.past.length === 0) return null;
  return {
    value: h.past[h.past.length - 1],
    history: { past: h.past.slice(0, -1), future: [current, ...h.future] },
  };
}

/** Step forward again after an undo, or null if there's nothing to redo. */
export function redo<T>(h: History<T>, current: T): { value: T; history: History<T> } | null {
  if (h.future.length === 0) return null;
  return {
    value: h.future[0],
    history: { past: [...h.past, current], future: h.future.slice(1) },
  };
}
