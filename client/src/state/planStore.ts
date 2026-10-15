import { create } from "zustand";
import type { PlanDoc, PlanSummary } from "@cookplan/shared";
import { reflow, sanitizeDeps } from "@cookplan/shared";
import { api } from "../api/client";

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
      set({ doc, saveState: "saved", lastSavedAt: doc.plan.updatedAt });
      await get().loadPlans();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  deletePlan: async (id) => {
    try {
      await api.deletePlan(id);
      if (get().doc?.plan.id === id) set({ doc: null });
      await get().loadPlans();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  openPlan: async (id) => {
    set({ docLoading: true, error: null });
    try {
      const doc = await api.getPlan(id);
      set({ doc: normalize(doc), docLoading: false, saveState: "saved", lastSavedAt: doc.plan.updatedAt });
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
    set({ doc: null, saveState: "saved" });
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
      const cloned = await api.clonePlan(templateId, { name, anchorTime });
      set({ doc: normalize(cloned), saveState: "saved", lastSavedAt: cloned.plan.updatedAt });
      await get().loadPlans();
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  updateDoc: (mutate) => {
    const doc = get().doc;
    if (!doc) return;
    const next = normalize(mutate(doc));
    set({ doc: next, saveState: "saving" });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveNow();
    }, 750);
  },
}));

/** Save the open plan straight away (after any save already in flight). */
async function saveNow(): Promise<void> {
  if (inFlight) await inFlight;
  const latest = usePlanStore.getState().doc;
  if (!latest) return;
  const run = (async () => {
    try {
      const saved = await api.savePlan(latest);
      // Only mark it saved if nothing changed while the request was out.
      if (!saveTimer && usePlanStore.getState().doc === latest) {
        usePlanStore.setState({ saveState: "saved", lastSavedAt: saved.plan.updatedAt, error: null });
      } else {
        usePlanStore.setState({ lastSavedAt: saved.plan.updatedAt });
      }
    } catch (e) {
      usePlanStore.setState({ saveState: "error", error: (e as Error).message });
    }
  })();
  inFlight = run;
  try {
    await run;
  } finally {
    if (inFlight === run) inFlight = null;
  }
}

/** True while an edit hasn't reached the server yet (drives the "Leave site?" warning). */
export function hasUnsavedChanges(): boolean {
  return saveTimer !== null || inFlight !== null || usePlanStore.getState().saveState === "error";
}
