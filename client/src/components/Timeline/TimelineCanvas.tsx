import { useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy, type SortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Group, PlanDoc, Task } from "@cookplan/shared";
import { currentTaskIds, derivedTaskIds, planEndMin } from "@cookplan/shared";
import TimeAxis from "./TimeAxis";
import TaskBar from "./TaskBar";
import DependencyLines from "./DependencyLines";
import { RAIL_W, ZOOM_LEVELS, useZoomPan } from "../../hooks/useZoomPan";

const AXIS_H = 28;
const GROUP_H = 32;
const ROW_H = 40;

interface Props {
  doc: PlanDoc;
  zoomIdx: number;
  setZoomIdx: (idx: number) => void;
  linkPredecessorId: string | null;
  /** Minutes into the live run, or null when not live. */
  nowMin: number | null;
  liveZeroAt: string | null;
  /** Live/finished plans: no drag editing, taps only. */
  readOnly: boolean;
  onTaskClick: (task: Task) => void;
  onAddTask: (groupId: string | null) => void;
  onEditGroup: (group: Group) => void;
  onTaskTimeChange: (taskId: string, startMin: number, durationMin: number) => void;
  /** Reorder within a group: the full task order after the move. */
  onReorder: (orderedTaskIds: string[], movedTaskId: string) => void;
  /** A task dropped on another group (its header or one of its tasks): it goes to the bottom of that group. */
  onMoveToGroup: (taskId: string, groupId: string | null) => void;
  onLockedDragAttempt: (task: Task) => void;
  /** Extra classes for a task's bar, e.g. a clash outline. */
  barClass?: (task: Task) => string;
}

interface Section {
  group: Group | null;
  tasks: Task[];
}

function SortableTaskRow({
  task,
  children,
  onEdit,
  disabled,
}: {
  task: Task;
  children: React.ReactNode;
  onEdit: () => void;
  /** Rows can't be reordered while a run is live or finished. */
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
    disabled,
  });
  // While dragged, the row stays in its slot as a faded placeholder (the label following the
  // pointer is a separate overlay), so it never covers another task.
  return (
    <div
      ref={setNodeRef}
      className={`timeline-row task-row-line${isDragging ? " row-dragging" : ""}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="rail-cell task-cell"
        onClick={onEdit}
        onContextMenu={(e) => e.preventDefault()}
        {...attributes}
        {...listeners}
      >
        {!disabled && (
          <span className="drag-grip" aria-hidden>
            ⠿
          </span>
        )}
        {task.name}
      </button>
      {children}
    </div>
  );
}

/** Drop-target ids for a group's header and its end slot: "group:<id>" / "groupend:<id>" ("" = Ungrouped). */
const GROUP_DROP = "group:";
const GROUP_END = "groupend:";

/** The bottom of a group: an "Add task" row that turns into a "drop here" slot while dragging in. */
function GroupEnd({
  groupId,
  incoming,
  groupName,
  children,
}: {
  groupId: string | null;
  /** A task from another group is being dragged over this group. */
  incoming: boolean;
  groupName: string;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: GROUP_END + (groupId ?? "") });
  return (
    <div ref={setNodeRef} className={`timeline-row task-row-line add-row${incoming ? " drop-slot" : ""}`}>
      {incoming ? <div className="rail-cell task-cell drop-slot-label">Drop here</div> : children}
      <div className="track">
        {incoming && <span className="drop-slot-hint">Goes to the bottom of {groupName}; the other tasks stay where they are</span>}
      </div>
    </div>
  );
}

/** A group's header row, which also accepts a dragged task (it then joins that group at the bottom). */
function GroupHeader({
  groupId,
  disabled,
  highlight,
  children,
}: {
  groupId: string | null;
  disabled: boolean;
  highlight: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef } = useDroppable({ id: GROUP_DROP + (groupId ?? ""), disabled });
  return (
    <div ref={setNodeRef} className={`timeline-row group-row${highlight ? " group-drop-target" : ""}`}>
      {children}
      <div className="track group-track" />
    </div>
  );
}

export default function TimelineCanvas({
  doc,
  zoomIdx,
  setZoomIdx,
  linkPredecessorId,
  nowMin,
  liveZeroAt,
  readOnly,
  onTaskClick,
  onAddTask,
  onEditGroup,
  onTaskTimeChange,
  onReorder,
  onMoveToGroup,
  onLockedDragAttempt,
  barClass,
}: Props) {
  const { plan, groups, tasks } = doc;
  const pxPerMin = ZOOM_LEVELS[zoomIdx];
  const endMin = planEndMin(tasks);
  const totalMin = Math.max(120, Math.ceil((endMin + 30) / 30) * 30);
  const scrollRef = useRef<HTMLDivElement>(null);
  useZoomPan(scrollRef, zoomIdx, setZoomIdx);
  const lockedIds = useMemo(() => derivedTaskIds(doc.deps), [doc.deps]);
  const liveCurrent = nowMin !== null ? currentTaskIds(tasks, nowMin) : new Set<string>();

  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 8 } }),
  );

  const sections = useMemo<Section[]>(() => {
    const byGroup: Section[] = [...groups]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((g) => ({
        group: g,
        tasks: tasks.filter((t) => t.groupId === g.id).sort((a, b) => a.sortOrder - b.sortOrder),
      }));
    const ungrouped = tasks.filter((t) => !t.groupId).sort((a, b) => a.sortOrder - b.sortOrder);
    if (ungrouped.length > 0 || byGroup.length === 0) {
      byGroup.push({ group: null, tasks: ungrouped });
    }
    return byGroup;
  }, [groups, tasks]);

  const flatTaskIds = useMemo(() => sections.flatMap((s) => s.tasks.map((t) => t.id)), [sections]);

  // Fixed row heights make dependency-line geometry computable without DOM reads.
  const { taskRowY, totalH } = useMemo(() => {
    const map = new Map<string, number>();
    let y = AXIS_H;
    for (const section of sections) {
      const hasHeader = section.group !== null || sections.length > 1;
      if (hasHeader) y += GROUP_H;
      if (section.tasks.length === 0) {
        y += ROW_H;
        continue;
      }
      for (const t of section.tasks) {
        map.set(t.id, y);
        y += ROW_H;
      }
      if (!readOnly) y += ROW_H;
    }
    return { taskRowY: map, totalH: y };
  }, [sections, readOnly]);

  // Which group each task is in, and which group a drop target belongs to (a task, or a group header).
  const groupOf = useMemo(() => new Map(tasks.map((t) => [t.id, t.groupId])), [tasks]);
  const targetGroup = (overId: string): string | null | undefined =>
    overId.startsWith(GROUP_DROP)
      ? overId.slice(GROUP_DROP.length) || null
      : overId.startsWith(GROUP_END)
        ? overId.slice(GROUP_END.length) || null
        : groupOf.get(overId);
  const [drag, setDrag] = useState<{ id: string; from: string | null; to: string | null | undefined } | null>(null);
  const draggedTask = drag ? tasks.find((t) => t.id === drag.id) : undefined;
  /** Is a task from another group being dragged over this one? */
  const incomingTo = (groupId: string | null) => !!drag && drag.to !== undefined && drag.to === groupId && drag.from !== groupId;

  // Rows only make room for the dragged task within its own group. Over another group nothing
  // moves: that group's header is highlighted, and the task joins it at the bottom.
  const sameGroupOnly: SortingStrategy = (args) => {
    const a = flatTaskIds[args.activeIndex];
    const o = flatTaskIds[args.overIndex];
    if (args.overIndex < 0 || o === undefined || groupOf.get(a) !== groupOf.get(o)) return null;
    return verticalListSortingStrategy(args);
  };

  const handleDragEnd = (e: DragEndEvent) => {
    setDrag(null);
    const { active, over } = e;
    if (!over || readOnly) return;
    const id = String(active.id);
    const from = groupOf.get(id) ?? null;
    const to = targetGroup(String(over.id));
    if (to === undefined) return;
    if (to !== from) {
      onMoveToGroup(id, to);
      return;
    }
    if (over.id === active.id || String(over.id).startsWith(GROUP_DROP) || String(over.id).startsWith(GROUP_END)) return;
    const oldIdx = flatTaskIds.indexOf(id);
    const newIdx = flatTaskIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(flatTaskIds, oldIdx, newIdx), id);
  };

  return (
    <div className="timeline-scroll" ref={scrollRef}>
      <div className="timeline-inner" style={{ width: RAIL_W + totalMin * pxPerMin }}>
        <div className="timeline-row axis-header">
          <div className="rail-cell" />
          <TimeAxis
            key={`${plan.mode}|${plan.anchorTime}|${liveZeroAt ?? ""}`}
            totalMin={totalMin}
            pxPerMin={pxPerMin}
            mode={liveZeroAt ? "forward" : plan.mode}
            anchorTime={liveZeroAt ?? plan.anchorTime}
            endMin={liveZeroAt ? 0 : endMin}
          />
        </div>

        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(e) => setDrag({ id: String(e.active.id), from: groupOf.get(String(e.active.id)) ?? null, to: undefined })}
          onDragOver={(e) => setDrag((d) => d && { ...d, to: e.over ? targetGroup(String(e.over.id)) : undefined })}
          onDragCancel={() => setDrag(null)}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={flatTaskIds} strategy={sameGroupOnly}>
            {sections.map((section) => (
              <div key={section.group?.id ?? "__ungrouped"} className="timeline-section">
                {section.group ? (
                  <GroupHeader
                    groupId={section.group.id}
                    disabled={readOnly}
                    highlight={incomingTo(section.group.id)}
                  >
                    <button
                      className="rail-cell group-cell"
                      onClick={() => onEditGroup(section.group!)}
                      title="Edit group"
                    >
                      <span className="group-dot" style={{ background: section.group.color }} />
                      {section.group.name}
                    </button>
                  </GroupHeader>
                ) : (
                  sections.length > 1 && (
                    <GroupHeader groupId={null} disabled={readOnly} highlight={incomingTo(null)}>
                      <div className="rail-cell group-cell muted">Ungrouped</div>
                    </GroupHeader>
                  )
                )}
                {section.tasks.map((task) => (
                  <SortableTaskRow key={task.id} task={task} disabled={readOnly} onEdit={() => onTaskClick(task)}>
                    <div className="track">
                      <TaskBar
                        task={task}
                        groups={groups}
                        pxPerMin={pxPerMin}
                        mode={plan.mode}
                        anchorTime={liveZeroAt ?? plan.anchorTime}
                        endMin={liveZeroAt ? 0 : endMin}
                        forceForward={liveZeroAt !== null}
                        locked={lockedIds.has(task.id)}
                        readOnly={readOnly}
                        liveClass={[
                          task.status === "done" ? "task-bar-done" : liveCurrent.has(task.id) ? "task-bar-current" : "",
                          barClass?.(task) ?? "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        linkSelected={linkPredecessorId === task.id}
                        onClick={() => onTaskClick(task)}
                        onCommit={(s, d) => onTaskTimeChange(task.id, s, d)}
                        onLockedDragAttempt={() => onLockedDragAttempt(task)}
                      />
                    </div>
                  </SortableTaskRow>
                ))}
                {!readOnly && (
                  <GroupEnd
                    groupId={section.group?.id ?? null}
                    incoming={incomingTo(section.group?.id ?? null)}
                    groupName={section.group?.name ?? "Ungrouped"}
                  >
                    <button
                      className="rail-cell task-cell add-cell"
                      onClick={() => onAddTask(section.group?.id ?? null)}
                    >
                      + Add task
                    </button>
                  </GroupEnd>
                )}
                {readOnly && section.tasks.length === 0 && (
                  <div className="timeline-row task-row-line">
                    <div className="rail-cell task-cell muted empty-hint">No tasks yet</div>
                    <div className="track" />
                  </div>
                )}
              </div>
            ))}
          </SortableContext>
          {/* What follows the pointer: just the task's name, so nothing underneath is hidden. */}
          <DragOverlay dropAnimation={null}>
            {draggedTask ? (
              <div className="drag-chip">
                <span className="drag-grip" aria-hidden>
                  ⠿
                </span>
                {draggedTask.name}
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>

        <DependencyLines
          tasks={tasks}
          deps={doc.deps}
          taskRowY={taskRowY}
          pxPerMin={pxPerMin}
          railW={RAIL_W}
          width={RAIL_W + totalMin * pxPerMin}
          height={totalH}
        />

        {nowMin !== null && nowMin >= 0 && nowMin <= totalMin && (
          <div
            className="now-line"
            style={{ left: RAIL_W + nowMin * pxPerMin, height: totalH }}
            aria-hidden
          />
        )}
      </div>
    </div>
  );
}
