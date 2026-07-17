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
      </div>

      <TimelineCanvas
        doc={doc}
        onEditTask={(t) => setEditingTaskId(t.id)}
        onEditGroup={(g) => setEditingGroupId(g.id)}
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
