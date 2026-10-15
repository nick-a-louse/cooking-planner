import { useEffect, useMemo, useRef, useState } from "react";
import type { Group, Plan, Task } from "@cookplan/shared";
import {
  clashingTaskIds,
  criticalTaskIds,
  handsOnOverloads,
  currentTaskIds,
  equipmentClashes,
  formatHM,
  liveWallClock,
  nextTaskIds,
  nextUnusedColor,
  nowOffsetMin,
  predecessorsOf,
  wouldCreateCycle,
} from "@cookplan/shared";
import PlanList from "./components/PlanList";
import AppHeader from "./components/AppHeader";
import TimelineCanvas from "./components/Timeline/TimelineCanvas";
import TaskEditor from "./components/TaskEditor";
import GroupEditor from "./components/GroupEditor";
import PlanSettings from "./components/PlanSettings";
import ConfirmDialog from "./components/ConfirmDialog";
import StartDialog from "./components/Live/StartDialog";
import LiveTaskPanel from "./components/Live/LiveTaskPanel";
import { useNow } from "./hooks/useNow";
import LiveAlerts from "./components/Live/LiveAlerts";
import KitchenView from "./components/Live/KitchenView";
import PlanWarnings from "./components/PlanWarnings";
import PrintView from "./components/PrintView";
import { useLiveView } from "./hooks/useLiveView";
import { chime } from "./utils/chime";
import { useKeepAwake } from "./hooks/useKeepAwake";
import { useMuted } from "./hooks/useMuted";
import { hasUnsavedChanges, usePlanStore } from "./state/planStore";

export default function App() {
  const { doc, closePlan, saveState, lastSavedAt, error, notice, clearNotice, updateDoc, saveAsTemplate, history, undo, redo } =
    usePlanStore();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(1);
  const [linking, setLinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkPred, setLinkPred] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [liveTaskId, setLiveTaskId] = useState<string | null>(null);
  /** Opened from the kitchen view's Done button: go straight to marking it done. */
  const [liveTaskDone, setLiveTaskDone] = useState(false);
  const [leaveUnsaved, setLeaveUnsaved] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const now = useNow();

  const isLive = doc?.plan.status === "live" && !!doc.plan.liveStartedAt;
  const liveZeroAt = doc?.plan.liveStartedAt ?? null;
  const nowMin = isLive && liveZeroAt ? nowOffsetMin(liveZeroAt, now) : null;

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // The plan (timeline) screen is full width, an agreed exception to the 1200px column; the list isn't.
  const planOpen = !!doc;
  useEffect(() => {
    document.body.classList.toggle("g-wide", planOpen);
  }, [planOpen]);

  // Something changed on another device (live sync): say so for a little longer than a normal toast.
  useEffect(() => {
    if (!notice || !doc) return;
    setToast(notice);
    clearNotice();
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }, [notice, doc, clearNotice]);

  // Undo / redo shortcuts while planning: Ctrl+Z, Ctrl+Shift+Z or Ctrl+Y (Cmd on a Mac).
  // Left alone while typing in a box or with a dialog open, where they mean something else.
  const isDraft = doc?.plan.status === "draft";
  useEffect(() => {
    if (!isDraft) return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, select, [contenteditable='true']") || document.querySelector(".modal-overlay")) return;
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) undo();
      else if ((key === "z" && e.shiftKey) || key === "y") redo();
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isDraft, undo, redo]);

  // Closing or reloading the tab with an edit not yet saved: let the browser ask "Leave site?".
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (!hasUnsavedChanges()) return;
      e.preventDefault();
      e.returnValue = ""; // older browsers need this as well
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, []);

  // Live run: keep the screen on, and alert (sound + banner) at each task's moments.
  useKeepAwake(isLive);
  const [muted, toggleMuted] = useMuted();
  const [liveView, setLiveView] = useLiveView();
  const kitchen = isLive && liveView === "kitchen";

  // Kitchen clashes (warnings only), shown while planning.
  const clashes = useMemo(
    () => (doc && doc.plan.status === "draft" ? equipmentClashes(doc.tasks, { ovens: doc.plan.ovens, hobRings: doc.plan.hobRings }) : []),
    [doc],
  );
  const clashIds = useMemo(() => clashingTaskIds(clashes), [clashes]);
  // More hands-on tasks at once than cooks (warnings only), shown while planning.
  const busy = useMemo(() => (doc && doc.plan.status === "draft" ? handsOnOverloads(doc.tasks, doc.plan.cooks) : []), [doc]);
  const busyIds = useMemo(() => new Set(busy.flatMap((o) => o.taskIds)), [busy]);

  // Critical path: off by default; outlines the chain that decides when the meal is ready.
  const [showCritical, setShowCritical] = useState(false);
  const criticalIds = useMemo(
    () => (showCritical && doc ? criticalTaskIds(doc.tasks, doc.deps) : null),
    [showCritical, doc],
  );

  if (!doc) return <PlanList />;

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const editingTask = doc.tasks.find((t) => t.id === editingTaskId) ?? null;
  const editingGroup = doc.groups.find((g) => g.id === editingGroupId) ?? null;

  const addTask = (kind: Task["kind"] = "task", groupId: string | null = null) => {
    const id = crypto.randomUUID();
    updateDoc((d) => ({
      ...d,
      tasks: [
        ...d.tasks,
        {
          id,
          planId: d.plan.id,
          groupId,
          kind,
          name: kind === "wait" ? "Wait" : "New task",
          startMin: 0,
          durationMin: 15,
          color: null,
          notes: "",
          sortOrder: d.tasks.reduce((m, t) => Math.max(m, t.sortOrder), 0) + 1,
          status: "pending",
          actualStartAt: null,
          actualDoneAt: null,
          equipment: null,
          ovenTemp: null,
          handsOff: false,
        } satisfies Task,
      ],
    }));
    setEditingTaskId(id);
  };

  const addGroup = () => {
    const id = crypto.randomUUID();
    updateDoc((d) => ({
      ...d,
      groups: [
        ...d.groups,
        {
          id,
          planId: d.plan.id,
          name: `Group ${d.groups.length + 1}`,
          color: nextUnusedColor(d.groups.map((g) => g.color)),
          sortOrder: d.groups.reduce((m, g) => Math.max(m, g.sortOrder), 0) + 1,
        } satisfies Group,
      ],
    }));
    setEditingGroupId(id);
  };

  const saveTask = (updated: Task, predecessorIds: string[]) => {
    updateDoc((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === updated.id ? updated : t)),
      deps: [
        ...d.deps.filter((dep) => dep.successorId !== updated.id),
        ...predecessorIds
          .filter((pid) =>
            !wouldCreateCycle(
              d.deps.filter((dep) => dep.successorId !== updated.id),
              pid,
              updated.id,
            ),
          )
          .map((pid) => ({ planId: d.plan.id, predecessorId: pid, successorId: updated.id })),
      ],
    }));
    setEditingTaskId(null);
  };

  const deleteTask = (taskId: string) => {
    updateDoc((d) => ({
      ...d,
      tasks: d.tasks.filter((t) => t.id !== taskId),
      deps: d.deps.filter((dep) => dep.predecessorId !== taskId && dep.successorId !== taskId),
    }));
    setEditingTaskId(null);
  };

  const saveGroup = (updated: Group) => {
    updateDoc((d) => ({
      ...d,
      groups: d.groups.map((g) => (g.id === updated.id ? updated : g)),
    }));
    setEditingGroupId(null);
  };

  const deleteGroup = (groupId: string) => {
    updateDoc((d) => ({
      ...d,
      groups: d.groups.filter((g) => g.id !== groupId),
      tasks: d.tasks.map((t) => (t.groupId === groupId ? { ...t, groupId: null } : t)),
    }));
    setEditingGroupId(null);
  };

  const changeTaskTime = (taskId: string, startMin: number, durationMin: number) => {
    updateDoc((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === taskId ? { ...t, startMin, durationMin } : t)),
    }));
  };

  const reorderTasks = (orderedIds: string[], movedId: string) => {
    updateDoc((d) => {
      const byId = new Map(d.tasks.map((t) => [t.id, t]));
      const movedIdx = orderedIds.indexOf(movedId);
      const neighbourId = movedIdx > 0 ? orderedIds[movedIdx - 1] : orderedIds[movedIdx + 1];
      const newGroupId = neighbourId ? (byId.get(neighbourId)?.groupId ?? null) : null;
      return {
        ...d,
        tasks: orderedIds.map((id, i) => {
          const t = byId.get(id)!;
          const groupId = id === movedId ? newGroupId : t.groupId;
          return { ...t, groupId, sortOrder: i };
        }),
      };
    });
  };

  const startRun = (liveZeroAtIso: string) => {
    updateDoc((d) => ({
      ...d,
      plan: { ...d.plan, status: "live", liveStartedAt: liveZeroAtIso },
    }));
    setStartDialogOpen(false);
    if (!muted) chime(); // also unlocks sound on phones, which need a tap first
    showToast("Cooking started — tap a task to see notes or mark it done");
  };

  const endRun = () => {
    updateDoc((d) => ({ ...d, plan: { ...d.plan, status: "done" } }));
    showToast("Run finished");
  };

  const resetRun = () => {
    updateDoc((d) => ({
      ...d,
      plan: { ...d.plan, status: "draft", liveStartedAt: null },
      tasks: d.tasks.map((t) => ({ ...t, status: "pending" as const, actualStartAt: null, actualDoneAt: null })),
    }));
    setSettingsOpen(false);
    showToast("Run reset — plan is editable again");
  };

  const completeTask = (task: Task, actualEndMin: number, applyShift: boolean) => {
    updateDoc((d) => ({
      ...d,
      tasks: d.tasks.map((t) =>
        t.id === task.id
          ? {
              ...t,
              status: "done" as const,
              actualDoneAt: new Date().toISOString(),
              ...(applyShift ? { durationMin: Math.max(1, actualEndMin - t.startMin) } : {}),
            }
          : t,
      ),
    }));
    setLiveTaskId(null);
    const remaining = doc.tasks.filter((t) => t.id !== task.id && t.status !== "done").length;
    showToast(remaining === 0 ? "All tasks done" : `"${task.name}" done`);
  };

  const handleTaskClick = (task: Task) => {
    if (isLive || doc.plan.status === "done") {
      setLiveTaskId(task.id);
      return;
    }
    if (!linking) {
      setEditingTaskId(task.id);
      return;
    }
    if (!linkPred) {
      setLinkPred(task.id);
      showToast(`"${task.name}" selected — now tap the task that follows it`);
      return;
    }
    if (linkPred === task.id) {
      setLinkPred(null);
      return;
    }
    const predTask = doc.tasks.find((t) => t.id === linkPred);
    if (doc.deps.some((d) => d.predecessorId === linkPred && d.successorId === task.id)) {
      showToast("Those tasks are already linked");
    } else if (wouldCreateCycle(doc.deps, linkPred, task.id)) {
      showToast("Can't link — that would create a loop");
    } else {
      updateDoc((d) => ({
        ...d,
        deps: [...d.deps, { planId: d.plan.id, predecessorId: linkPred, successorId: task.id }],
      }));
      showToast(`"${task.name}" now starts after "${predTask?.name ?? "task"}"`);
    }
    setLinking(false);
    setLinkPred(null);
  };

  const savePlanSettings = (updated: Plan) => {
    updateDoc((d) => ({ ...d, plan: updated }));
    setSettingsOpen(false);
    showToast(
      updated.mode === "backward"
        ? `Times now work backward from ${updated.anchorTime.slice(11, 16)}`
        : `Times now run forward from ${updated.anchorTime.slice(11, 16)}`,
    );
  };

  const handleLockedDragAttempt = (task: Task) => {
    const predNames = predecessorsOf(task.id, doc.deps)
      .map((id) => doc.tasks.find((t) => t.id === id)?.name)
      .filter(Boolean)
      .join(", ");
    showToast(`"${task.name}" starts after ${predNames || "its linked task"} — edit that task or remove the link`);
  };

  return (
    <div className="plan-view">
      <AppHeader
        title={doc.plan.name}
        updatedIso={lastSavedAt ?? ""}
        updatedError={saveState === "error" ? error ?? "The last save didn't reach the server" : null}
      >
        <button className="btn btn-small" onClick={async () => {
            if (!(await closePlan())) setLeaveUnsaved(true);
          }}
        >
          <BackIcon /> Plans
        </button>
        <button className="btn btn-small" onClick={() => setSettingsOpen(true)} title="Plan settings">
          {doc.plan.mode === "backward" ? "Finish" : "Start"} {doc.plan.anchorTime.slice(11, 16)}
        </button>
        <button className="btn btn-small" onClick={() => window.print()} title="Print a timeline and a timed checklist, or save them as a PDF">
          Print
        </button>
      </AppHeader>

      <div className="wrap toolbar">
        {doc.plan.status === "draft" && (
          <>
            <button onClick={() => addTask()}>+ Task</button>
            <button onClick={() => addTask("wait")}>+ Wait</button>
            <button onClick={addGroup}>+ Group</button>
            <button onClick={undo} disabled={history.past.length === 0} title="Undo (Ctrl+Z)" aria-label="Undo">
              <UndoIcon />
            </button>
            <button onClick={redo} disabled={history.future.length === 0} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
              <UndoIcon redo />
            </button>
            <button
              className={linking ? "btn-active" : ""}
              onClick={() => {
                setLinking(!linking);
                setLinkPred(null);
                if (!linking) showToast("Link mode: tap the task that comes first");
              }}
            >
              Link
            </button>
            {doc.tasks.length > 0 && (
              <button className="btn-start" onClick={() => setStartDialogOpen(true)}>
                Start cooking
              </button>
            )}
          </>
        )}
        {isLive && nowMin !== null && liveZeroAt && (
          <>
            <span className="live-status" hidden={kitchen}>
              {(() => {
                const current = doc.tasks.filter((t) => currentTaskIds(doc.tasks, nowMin).has(t.id));
                const next = doc.tasks.filter((t) => nextTaskIds(doc.tasks, nowMin).has(t.id));
                const nowPart = current.length > 0 ? `Now: ${current.map((t) => t.name).join(", ")}` : null;
                const nextPart =
                  next.length > 0
                    ? `Next: ${next[0].name} ${formatHM(liveWallClock(next[0].startMin, liveZeroAt))}`
                    : null;
                return [nowPart, nextPart].filter(Boolean).join(" · ") || "All tasks done";
              })()}
            </span>
            <span className="spacer" />
            <div className="seg" role="radiogroup" aria-label="View">
              {(["timeline", "kitchen"] as const).map((v) => (
                <button key={v} type="button" role="radio" aria-checked={liveView === v} onClick={() => setLiveView(v)}>
                  {v === "timeline" ? "Timeline" : "Kitchen"}
                </button>
              ))}
            </div>
            <button onClick={toggleMuted} aria-pressed={muted} title={muted ? "Alert sounds are off on this device" : "Alert sounds are on"}>
              {muted ? "Sound off" : "Sound on"}
            </button>
            <button onClick={endRun}>End run</button>
          </>
        )}
        {doc.plan.status === "done" && <span className="live-status muted">Run finished</span>}
        {!isLive && <span className="spacer" />}
        {!kitchen && (
          <>
            <button
              onClick={() => setShowCritical(!showCritical)}
              aria-pressed={showCritical}
              className={showCritical ? "btn-active" : ""}
              title="Outline the tasks that decide when the meal is ready; a delay to any of them makes it later"
            >
              Critical path
            </button>
            <button onClick={() => setZoomIdx(Math.max(0, zoomIdx - 1))} disabled={zoomIdx === 0} aria-label="Zoom out">
              −
            </button>
            <button onClick={() => setZoomIdx(Math.min(2, zoomIdx + 1))} disabled={zoomIdx === 2} aria-label="Zoom in">
              +
            </button>
          </>
        )}
      </div>

      {kitchen && liveZeroAt && (
        <div className="wrap kitchen-wrap">
          <KitchenView
            doc={doc}
            liveZeroAt={liveZeroAt}
            onOpen={(t) => {
              setLiveTaskDone(false);
              setLiveTaskId(t.id);
            }}
            onDone={(t) => {
              setLiveTaskDone(true);
              setLiveTaskId(t.id);
            }}
          />
        </div>
      )}
      {(clashes.length > 0 || busy.length > 0) && (
        <div className="wrap">
          <PlanWarnings doc={doc} clashes={clashes} busy={busy} onOpenTask={(t) => setEditingTaskId(t.id)} />
        </div>
      )}
      <div className="wrap timeline-wrap" hidden={kitchen}>
      <TimelineCanvas
        doc={doc}
        zoomIdx={zoomIdx}
        setZoomIdx={setZoomIdx}
        linkPredecessorId={linkPred}
        nowMin={nowMin}
        liveZeroAt={liveZeroAt}
        readOnly={doc.plan.status !== "draft"}
        onTaskClick={handleTaskClick}
        onAddTask={(groupId) => addTask("task", groupId)}
        onEditGroup={(g) => setEditingGroupId(g.id)}
        onTaskTimeChange={changeTaskTime}
        onReorder={reorderTasks}
        onLockedDragAttempt={handleLockedDragAttempt}
        barClass={(t) =>
          [
            clashIds.has(t.id) ? "task-bar-clash" : "",
            busyIds.has(t.id) ? "task-bar-busy" : "",
            criticalIds ? (criticalIds.has(t.id) ? "task-bar-critical" : "task-bar-dim") : "",
          ].join(" ")
        }
      />
      </div>

      {editingTask && (
        <TaskEditor
          doc={doc}
          task={editingTask}
          onSave={saveTask}
          onDelete={deleteTask}
          onClose={() => setEditingTaskId(null)}
        />
      )}
      {editingGroup && (
        <GroupEditor
          group={editingGroup}
          onSave={saveGroup}
          onDelete={deleteGroup}
          onClose={() => setEditingGroupId(null)}
        />
      )}

      {settingsOpen && (
        <PlanSettings
          plan={doc.plan}
          onSave={savePlanSettings}
          onSaveAsTemplate={() => {
            void saveAsTemplate(`${doc.plan.name} template`);
            setSettingsOpen(false);
            showToast(`Saved "${doc.plan.name}" as a template`);
          }}
          onResetRun={doc.plan.status !== "draft" ? resetRun : undefined}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {startDialogOpen && (
        <StartDialog doc={doc} onStart={startRun} onClose={() => setStartDialogOpen(false)} />
      )}

      {liveTaskId && liveZeroAt && doc.tasks.some((t) => t.id === liveTaskId) && (
        <LiveTaskPanel
          key={`${liveTaskId}-${liveTaskDone}`}
          doc={doc}
          task={doc.tasks.find((t) => t.id === liveTaskId)!}
          liveZeroAt={liveZeroAt}
          markDoneNow={liveTaskDone}
          onComplete={completeTask}
          onClose={() => setLiveTaskId(null)}
        />
      )}

      <PrintView doc={doc} />
      {isLive && liveZeroAt && <LiveAlerts doc={doc} liveZeroAt={liveZeroAt} muted={muted} />}
      {leaveUnsaved && (
        <ConfirmDialog
          title="Your last change wasn't saved"
          message={`${error ?? "The server didn't accept the save."} If you leave now, that change is lost.`}
          confirmLabel="Leave without saving"
          onConfirm={() => void closePlan(true)}
          onClose={() => setLeaveUnsaved(false)}
        />
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

function UndoIcon({ redo = false }: { redo?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={redo ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}
