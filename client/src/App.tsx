import { useState } from "react";
import type { Group, Task } from "@cookplan/shared";
import PlanList from "./components/PlanList";
import TimelineCanvas from "./components/Timeline/TimelineCanvas";
import TaskEditor from "./components/TaskEditor";
import GroupEditor from "./components/GroupEditor";
import { usePlanStore } from "./state/planStore";

const GROUP_PALETTE = ["#e11d48", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#3b82f6", "#8b5cf6"];

export default function App() {
  const { doc, closePlan, saveState, updateDoc } = usePlanStore();
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [zoomIdx, setZoomIdx] = useState(1);

  if (!doc) return <PlanList />;

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
          color: GROUP_PALETTE[d.groups.length % GROUP_PALETTE.length],
          sortOrder: d.groups.reduce((m, g) => Math.max(m, g.sortOrder), 0) + 1,
        } satisfies Group,
      ],
    }));
    setEditingGroupId(id);
  };

  const saveTask = (updated: Task) => {
    updateDoc((d) => ({
      ...d,
      tasks: d.tasks.map((t) => (t.id === updated.id ? updated : t)),
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
      // The moved task adopts the group of its new neighbourhood: the task
      // above it if any, otherwise the task below.
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

  const deleteGroup = (groupId: string) => {
    updateDoc((d) => ({
      ...d,
      groups: d.groups.filter((g) => g.id !== groupId),
      tasks: d.tasks.map((t) => (t.groupId === groupId ? { ...t, groupId: null } : t)),
    }));
    setEditingGroupId(null);
  };

  return (
    <div className="plan-view">
      <header className="plan-header">
        <button onClick={closePlan}>← Plans</button>
        <h2>{doc.plan.name}</h2>
        <span className={`save-state save-${saveState}`}>
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
        </span>
      </header>

      <div className="toolbar">
        <button onClick={addTask}>+ Task</button>
        <button onClick={addGroup}>+ Group</button>
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
        onEditTask={(t) => setEditingTaskId(t.id)}
        onEditGroup={(g) => setEditingGroupId(g.id)}
        onTaskTimeChange={changeTaskTime}
        onReorder={reorderTasks}
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
    </div>
  );
}
