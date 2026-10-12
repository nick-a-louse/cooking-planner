import { useEffect, useRef, useState } from "react";
import type { Group, Plan, Task } from "@cookplan/shared";
import {
  currentTaskIds,
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
import StartDialog from "./components/Live/StartDialog";
import LiveTaskPanel from "./components/Live/LiveTaskPanel";
import { useNow } from "./hooks/useNow";
import { chime } from "./utils/chime";
import { usePlanStore } from "./state/planStore";

export default function App() {
  const { doc, closePlan, saveState, lastSavedAt, error, updateDoc, saveAsTemplate } = usePlanStore();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(1);
  const [linking, setLinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkPred, setLinkPred] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [startDialogOpen, setStartDialogOpen] = useState(false);
  const [liveTaskId, setLiveTaskId] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const notifiedRef = useRef<Set<string>>(new Set());
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

  // Live reminders: chime + toast when a pending task starts within ~2 minutes.
  useEffect(() => {
    if (!doc || !isLive || nowMin === null || !liveZeroAt) return;
    for (const t of doc.tasks) {
      if (t.status !== "pending" || notifiedRef.current.has(t.id)) continue;
      const inMin = t.startMin - nowMin;
      if (inMin > 0 && inMin <= 2) {
        notifiedRef.current.add(t.id);
        chime();
        setToast(`Coming up: "${t.name}" at ${formatHM(liveWallClock(t.startMin, liveZeroAt))}`);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 6000);
      }
    }
  }, [doc, isLive, nowMin, liveZeroAt]);

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
    notifiedRef.current.clear();
    updateDoc((d) => ({
      ...d,
      plan: { ...d.plan, status: "live", liveStartedAt: liveZeroAtIso },
    }));
    setStartDialogOpen(false);
    chime();
    showToast("Cooking started — tap a task to see notes or mark it done");
  };

  const endRun = () => {
    updateDoc((d) => ({ ...d, plan: { ...d.plan, status: "done" } }));
    showToast("Run finished");
  };

  const resetRun = () => {
    notifiedRef.current.clear();
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
        <button className="btn btn-small" onClick={closePlan}>
          <BackIcon /> Plans
        </button>
        <button className="btn btn-small" onClick={() => setSettingsOpen(true)} title="Plan settings">
          {doc.plan.mode === "backward" ? "Finish" : "Start"} {doc.plan.anchorTime.slice(11, 16)}
        </button>
      </AppHeader>

      <div className="wrap toolbar">
        {doc.plan.status === "draft" && (
          <>
            <button onClick={() => addTask()}>+ Task</button>
            <button onClick={() => addTask("wait")}>+ Wait</button>
            <button onClick={addGroup}>+ Group</button>
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
            <span className="live-status">
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
            <button onClick={endRun}>End run</button>
          </>
        )}
        {doc.plan.status === "done" && <span className="live-status muted">Run finished</span>}
        {!isLive && <span className="spacer" />}
        <button onClick={() => setZoomIdx(Math.max(0, zoomIdx - 1))} disabled={zoomIdx === 0} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => setZoomIdx(Math.min(2, zoomIdx + 1))} disabled={zoomIdx === 2} aria-label="Zoom in">
          +
        </button>
      </div>

      <div className="wrap timeline-wrap">
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

      {liveTaskId && liveZeroAt && (
        <LiveTaskPanel
          doc={doc}
          task={doc.tasks.find((t) => t.id === liveTaskId)!}
          liveZeroAt={liveZeroAt}
          onComplete={completeTask}
          onClose={() => setLiveTaskId(null)}
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
