import { create } from "zustand";
import type { PlanDoc, PlanSummary } from "@cookplan/shared";
import { api } from "../api/client";

interface PlanState {
  plans: PlanSummary[];
  plansLoading: boolean;
  doc: PlanDoc | null;
  docLoading: boolean;
  saveState: "saved" | "saving" | "error";
  error: string | null;

  loadPlans: () => Promise<void>;
  createPlan: (name: string) => Promise<void>;
  deletePlan: (id: string) => Promise<void>;
  openPlan: (id: string) => Promise<void>;
  closePlan: () => void;
  /** Apply a local mutation to the open doc and schedule a debounced save. */
  updateDoc: (mutate: (doc: PlanDoc) => PlanDoc) => void;
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const usePlanStore = create<PlanState>((set, get) => ({
  plans: [],
  plansLoading: false,
  doc: null,
  docLoading: false,
  saveState: "saved",
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
      set({ doc });
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
      set({ doc: await api.getPlan(id), docLoading: false, saveState: "saved" });
    } catch (e) {
      set({ error: (e as Error).message, docLoading: false });
    }
  },

  closePlan: () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    set({ doc: null });
    void get().loadPlans();
  },

  updateDoc: (mutate) => {
    const doc = get().doc;
    if (!doc) return;
    const next = mutate(doc);
    set({ doc: next, saveState: "saving" });
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      saveTimer = null;
      const latest = get().doc;
      if (!latest) return;
      try {
        await api.savePlan(latest);
        set({ saveState: "saved" });
      } catch (e) {
        set({ saveState: "error", error: (e as Error).message });
      }
    }, 750);
  },
}));
