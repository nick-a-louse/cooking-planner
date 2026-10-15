import { useEffect, useRef, useState } from "react";
import type { AlertKind, LiveAlert, PlanDoc } from "@cookplan/shared";
import { alertsBetween, formatHM, liveWallClock, nowOffsetMin, taskColor } from "@cookplan/shared";
import { useNow } from "../../hooks/useNow";
import { chime } from "../../utils/chime";

interface Props {
  doc: PlanDoc;
  liveZeroAt: string;
  muted: boolean;
}

/** After a long gap (phone locked, laptop asleep) only catch up on this much, not a flood. */
const MAX_CATCH_UP_MIN = 15;

const LABEL: Record<AlertKind, string> = {
  soon: "Coming up",
  start: "Start now",
  end: "Time's up",
  waitEnd: "Wait over",
};

/**
 * Banners (plus a chime) for each moment of a live run: a task about to start, due to start,
 * due to finish, or a wait that's over. Banners stay until dismissed, or until the task is done.
 */
export default function LiveAlerts({ doc, liveZeroAt, muted }: Props) {
  const now = useNow(1000);
  const nowMin = nowOffsetMin(liveZeroAt, now);
  const lastMin = useRef<number | null>(null);
  const fired = useRef(new Set<string>());
  const [shown, setShown] = useState<LiveAlert[]>([]);
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  // A new run (or a reset) starts with a clean slate.
  useEffect(() => {
    lastMin.current = null;
    fired.current.clear();
    setShown([]);
  }, [liveZeroAt]);

  useEffect(() => {
    // First tick: start from now, so opening a plan mid-run doesn't replay the past.
    const from = Math.max(lastMin.current ?? nowMin, nowMin - MAX_CATCH_UP_MIN);
    lastMin.current = nowMin;
    const due = alertsBetween(doc.tasks, from, nowMin, doc.plan.alertLeadMin).filter(
      (a) => !fired.current.has(a.key),
    );
    if (due.length === 0) return;
    for (const a of due) fired.current.add(a.key);
    setShown((s) => [...s, ...due]);
    if (!mutedRef.current) chime(due.some((a) => a.kind === "start" || a.kind === "soon") ? "up" : "down");
  }, [nowMin, doc.tasks, doc.plan.alertLeadMin]);

  // A finished task's banners go away by themselves (e.g. ticked off on another device).
  const visible = shown.filter((a) => doc.tasks.find((t) => t.id === a.taskId && t.status !== "done"));
  if (visible.length === 0) return null;

  const dismiss = (key: string) => setShown((s) => s.filter((a) => a.key !== key));

  return (
    <div className="live-alerts" role="alert" aria-live="assertive">
      {visible.map((a) => {
        const task = doc.tasks.find((t) => t.id === a.taskId)!;
        const at = formatHM(liveWallClock(a.atMin, liveZeroAt));
        const detail =
          a.kind === "soon"
            ? `starts at ${formatHM(liveWallClock(task.startMin, liveZeroAt))}`
            : a.kind === "start"
              ? `due to start at ${at}`
              : a.kind === "end"
                ? `should be finished by ${at}`
                : `ended at ${at}`;
        return (
          <div key={a.key} className={`live-alert live-alert-${a.kind}`} style={{ borderLeftColor: taskColor(task, doc.groups) }}>
            <div className="live-alert-text">
              <span className="live-alert-label">{LABEL[a.kind]}</span>
              <span className="live-alert-task">{task.name}</span>
              <span className="live-alert-detail">{detail}</span>
            </div>
            <button type="button" className="live-alert-close" onClick={() => dismiss(a.key)} aria-label={`Dismiss ${task.name}`}>
              ✕
            </button>
          </div>
        );
      })}
      {visible.length > 1 && (
        <button type="button" className="live-alerts-clear" onClick={() => setShown([])}>
          Dismiss all
        </button>
      )}
    </div>
  );
}
