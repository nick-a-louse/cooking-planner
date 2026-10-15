import { useCallback, useState } from "react";

export type LiveView = "timeline" | "kitchen";
const KEY = "cookplan-live-view";

/** Timeline or kitchen view during a live run, remembered on this device. */
export function useLiveView(): [LiveView, (v: LiveView) => void] {
  const [view, setView] = useState<LiveView>(() => {
    try {
      return localStorage.getItem(KEY) === "kitchen" ? "kitchen" : "timeline";
    } catch {
      return "timeline";
    }
  });
  const choose = useCallback((v: LiveView) => {
    setView(v);
    try {
      localStorage.setItem(KEY, v);
    } catch {
      // Private browsing: still works for this visit.
    }
  }, []);
  return [view, choose];
}
