import { useEffect, useRef, useState } from "react";
import type { Group, Plan, Task } from "@cookplan/shared";
import { nextUnusedColor, predecessorsOf, wouldCreateCycle } from "@cookplan/shared";
import PlanList from "./components/PlanList";
import TimelineCanvas from "./components/Timeline/TimelineCanvas";
import TaskEditor from "./components/TaskEditor";
import GroupEditor from "./components/GroupEditor";
import PlanSettings from "./components/PlanSettings";
import { usePlanStore } from "./state/planStore";

export default function App() {
  const { doc, closePlan, saveState, updateDoc, saveAsTemplate } = usePlanStore();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(1);
  const [linking, setLinking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [linkPred, setLinkPred] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  if (!doc) return <PlanList />;

  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };

  const editingTask = doc.tasks.find((t) => t.id === editingTaskId) ?? null;
  const editingGroup = doc.groups.find((g) => g.id === editingGroupId) ?? null;

  const addTask = () => {
    const id = crypto.randomUUID();
    updateDoc((d) => ({
      ...d,
      tasks: [
        ...d.tasks,
        {
          id,
          planId: d.plan.id,
          groupId: null,
          name: "New task",
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

  const handleTaskClick = (task: Task) => {
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
      <header className="plan-header">
        <button onClick={closePlan}>← Plans</button>
        <h2>{doc.plan.name}</h2>
        <button className="anchor-chip" onClick={() => setSettingsOpen(true)} title="Plan settings">
          {doc.plan.mode === "backward" ? "Finish" : "Start"} {doc.plan.anchorTime.slice(11, 16)}
        </button>
        <span className={`save-state save-${saveState}`}>
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
        </span>
      </header>

      <div className="toolbar">
        <button onClick={addTask}>+ Task</button>
        <button onClick={addGroup}>+ Group</button>
        <button
          className={linking ? "btn-active" : ""}
          onClick={() => {
            setLinking(!linking);
            setLinkPred(null);
            if (!linking) showToast("Link mode: tap the task that comes first");
          }}
        >
          🔗 Link
        </button>
        <span className="spacer" />
        <button onClick={() => setZoomIdx(Math.max(0, zoomIdx - 1))} disabled={zoomIdx === 0} aria-label="Zoom out">
          −
        </button>
        <button onClick={() => setZoomIdx(Math.min(2, zoomIdx + 1))} disabled={zoomIdx === 2} aria-label="Zoom in">
          +
        </button>
      </div>

      <TimelineCanvas
        doc={doc}
        zoomIdx={zoomIdx}
        setZoomIdx={setZoomIdx}
        linkPredecessorId={linkPred}
        onTaskClick={handleTaskClick}
        onEditGroup={(g) => setEditingGroupId(g.id)}
        onTaskTimeChange={changeTaskTime}
        onReorder={reorderTasks}
        onLockedDragAttempt={handleLockedDragAttempt}
      />

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
          onClose={() => setSettingsOpen(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
