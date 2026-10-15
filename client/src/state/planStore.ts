import { create } from "zustand";
import type { History, PlanDoc, PlanSummary } from "@cookplan/shared";
import { emptyHistory, record, redo, reflow, sanitizeDeps, undo } from "@cookplan/shared";
import { api, ApiError } from "../api/client";

/** Enforce engine invariants: valid acyclic deps, dependent starts derived. */
function normalize(doc: PlanDoc): PlanDoc {
  const deps = sanitizeDeps(doc.deps, new Set(doc.tasks.map((t) => t.id)));
  return { ...doc, deps, tasks: reflow(doc.tasks, deps) };
}

interface PlanState {
  plans: PlanSummary[];
  plansLoading: boolean;
  doc: PlanDoc | null;
  docLoading: boolean;
  saveState: "saved" | "saving" | "error";
  /** When the open plan was last saved successfully (ISO, UTC). Drives the header's Updated line. */
  lastSavedAt: string | null;
  error: string | null;
  /** A one-off message about something that happened elsewhere, e.g. another device's change. */
  notice: string | null;
  /** Undo/redo for planning edits (draft plans only; live-run ticks aren't recorded). */
  history: History<PlanDoc>;

  loadPlans: () => Promise<void>;
  createPlan: (name: string) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  openPlan: (id: string) => Promise<void>;
  /**
   * Save any pending edit, then go back to the plan list. Returns false (and stays on the plan)
   * if the save failed, unless `discard` is set.
   */
  closePlan: (discard?: boolean) => Promise<boolean>;
  /** Apply a local mutation to the open doc and schedule a debounced save. */
  updateDoc: (mutate: (doc: PlanDoc) => PlanDoc) => void;
  /** Snapshot the currently open plan as a reusable template. */
  saveAsTemplate: (name: string) => Promise<void>;
  /** Clone a template into a fresh plan with a new name/anchor and open it. */
  useTemplate: (templateId: string, name: string, anchorTime: string) => Promise<void>;
  clearNotice: () => void;
  undo: () => void;
  redo: () => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
/** The save request currently in flight, so closing can wait for it. */
let inFlight: Promise<void> | null = null;

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: [],
  plansLoading: true, // until the first load finishes, so the header says "Loading…"
  doc: null,
  docLoading: false,
  saveState: "saved",
  lastSavedAt: null,
  error: null,
  notice: null,
  history: emptyHistory(),

  loadPlans: async () => {
    set({ plansLoading: true, error: null });
    try {
      set({ plans: await api.listPlans(), plansLoading: false });
    } catch (e) {
      set({ error: (e as Error).message, plansLoading: false });
    }
  },

  createPlan: async (name) => {
    try {
      const doc = await api.createPlan(name);
      showDoc(doc);
      await get().loadPlans();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deletePlan: async (id) => {
    try {
      await api.deletePlan(id);
      if (get().doc?.plan.id === id) leavePlan();
      await get().loadPlans();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  openPlan: async (id) => {
    set({ docLoading: true, error: null, notice: null });
    try {
      showDoc(await api.getPlan(id));
    } catch (e) {
      set({ error: (e as Error).message, docLoading: false });
    }
  },

  closePlan: async (discard = false) => {
    // Don't drop an edit made in the last moment: save it now instead of waiting for the timer.
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      await saveNow();
    } else if (inFlight) {
      await inFlight;
    }
    if (get().saveState === "error" && !discard) {
      await saveNow(); // one more try: the server may be back
      if (get().saveState === "error") return false;
    }
    leavePlan();
    void get().loadPlans();
    return true;
  },

  saveAsTemplate: async (name) => {
    const doc = get().doc;
    if (!doc) return;
    try {
      await api.clonePlan(doc.plan.id, { name, asTemplate: true });
      await get().loadPlans();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  useTemplate: async (templateId, name, anchorTime) => {
    try {
      showDoc(await api.clonePlan(templateId, { name, anchorTime }));
      await get().loadPlans();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  updateDoc: (mutate) => {
    const doc = get().doc;
    if (!doc) return;
    const next = normalize(mutate(doc));
    // Only planning edits go in the undo history: not live-run ticks, nor starting a run.
    if (doc.plan.status === "draft" && next.plan.status === "draft") set({ history: record(get().history, doc) });
    commit(next);
  },

  clearNotice: () => set({ notice: null }),

  undo: () => step(undo),
  redo: () => step(redo),
}));

/** Show a new version of the open plan and save it after a short pause (edits in a burst share one save). */
function commit(next: PlanDoc): void {
  usePlanStore.setState({ doc: next, saveState: "saving" });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void saveNow();
  }, 750);
}

/** Undo or redo one planning edit. */
function step(move: typeof undo): void {
  const { doc, history } = usePlanStore.getState();
  if (!doc || doc.plan.status !== "draft") return;
  const result = move(history, doc);
  if (!result) return;
  // The snapshot's content, but the current revision, so the save isn't mistaken for a stale copy.
  const restored = {
    ...result.value,
    plan: { ...result.value.plan, revision: doc.plan.revision, updatedAt: doc.plan.updatedAt },
  };
  usePlanStore.setState({ history: result.history });
  commit(normalize(restored));
}

/** Show a plan freshly loaded from the server, and start listening for other devices' changes. */
function showDoc(doc: PlanDoc): void {
  usePlanStore.setState({
    doc: normalize(doc),
    docLoading: false,
    saveState: "saved",
    lastSavedAt: doc.plan.updatedAt,
    error: null,
    history: emptyHistory(),
  });
  listen(doc.plan.id);
}

/** Back to the plan list: stop listening and forget any pending edit. */
function leavePlan(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  stopListening();
  usePlanStore.setState({ doc: null, saveState: "saved", history: emptyHistory() });
}

/** Save the open plan straight away (after any save already in flight). */
async function saveNow(): Promise<void> {
  if (inFlight) await inFlight;
  const latest = usePlanStore.getState().doc;
  if (!latest) return;
  const run = (async () => {
    try {
      const saved = await api.savePlan(latest);
      const current = usePlanStore.getState().doc;
      if (!current || current.plan.id !== saved.plan.id) return;
      const unchanged = !saveTimer && current === latest;
      // Keep any edit made while the request was out; just move it onto the new revision.
      usePlanStore.setState({
        doc: { ...current, plan: { ...current.plan, revision: saved.plan.revision, updatedAt: saved.plan.updatedAt } },
        lastSavedAt: saved.plan.updatedAt,
        ...(unchanged ? { saveState: "saved" as const, error: null } : {}),
      });
    } catch (e) {
      const body = e instanceof ApiError ? e.body : {};
      if (e instanceof ApiError && e.status === 409 && body.doc) {
        // Another device saved first. Their version wins; ours is dropped and the cook is told.
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = null;
        pendingRemote = null;
        const theirs = body.doc as PlanDoc;
        usePlanStore.setState({
          doc: normalize(theirs),
          saveState: "saved",
          lastSavedAt: theirs.plan.updatedAt,
          error: null,
          history: emptyHistory(), // the snapshots no longer match what's on screen
          notice: "This plan was changed on another device at the same time, so your last change wasn't saved. You're now seeing the latest version.",
        });
      } else {
        usePlanStore.setState({ saveState: "error", error: (e as Error).message });
      }
    }
  })();
  inFlight = run;
  try {
    await run;
  } finally {
    if (inFlight === run) inFlight = null;
  }
  applyPendingRemote();
}

/** True while an edit hasn't reached the server yet (drives the "Leave site?" warning). */
export function hasUnsavedChanges(): boolean {
  return saveTimer !== null || inFlight !== null || usePlanStore.getState().saveState === "error";
}

// ---------------------------------------------------------------- live sync

let source: EventSource | null = null;
let sourcePlanId: string | null = null;
/** A newer copy from another device that arrived while one of our own edits was unsaved. */
let pendingRemote: PlanDoc | null = null;

function listen(planId: string): void {
  if (source && sourcePlanId === planId) return;
  stopListening();
  sourcePlanId = planId;
  if (typeof EventSource === "undefined") return; // very old browser: no live sync, saves still work
  const es = new EventSource(api.planEventsUrl(planId));
  source = es;
  let dropped = false;
  es.addEventListener("plan", (e) => receive(JSON.parse((e as MessageEvent).data) as PlanDoc));
  es.addEventListener("deleted", () => {
    if (usePlanStore.getState().doc?.plan.id !== planId) return;
    leavePlan();
    usePlanStore.setState({ notice: "This plan was deleted on another device." });
    void usePlanStore.getState().loadPlans();
  });
  es.onerror = () => {
    dropped = true; // the browser reconnects by itself
  };
  es.onopen = () => {
    if (!dropped) return;
    dropped = false;
    // Back after a drop (server restart, Wi-Fi blip): catch up on anything missed meanwhile.
    api
      .getPlan(planId)
      .then(receive)
      .catch(() => {});
  };
}

function stopListening(): void {
  source?.close();
  source = null;
  sourcePlanId = null;
  pendingRemote = null;
}

/** A copy of the plan from the server. Show it if it's newer than ours and we have nothing unsaved. */
function receive(remote: PlanDoc): void {
  const local = usePlanStore.getState().doc;
  if (!local || local.plan.id !== remote.plan.id) return;
  if (remote.plan.revision <= local.plan.revision) return; // our own save coming back, or old news
  if (saveTimer || inFlight) {
    pendingRemote = remote; // decide once our save has finished
    return;
  }
  // Someone else changed the plan: the undo history would undo their change too, so start afresh.
  usePlanStore.setState({ doc: normalize(remote), lastSavedAt: remote.plan.updatedAt, history: emptyHistory() });
}

function applyPendingRemote(): void {
  const remote = pendingRemote;
  if (!remote || saveTimer || inFlight) return;
  pendingRemote = null;
  receive(remote);
}
