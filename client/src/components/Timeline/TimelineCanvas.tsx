import { useMemo, useRef } from "react";
import {
  DndContext,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
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
  onReorder: (orderedTaskIds: string[], movedTaskId: string) => void;
  onLockedDragAttempt: (task: Task) => void;
}

interface Section {
  group: Group | null;
  tasks: Task[];
}

function SortableTaskRow({
  task,
  children,
  onEdit,
}: {
  task: Task;
  children: React.ReactNode;
  onEdit: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });
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
        <span className="drag-grip" aria-hidden>
          ⠿
        </span>
        {task.name}
      </button>
      {children}
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
  onLockedDragAttempt,
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

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIdx = flatTaskIds.indexOf(String(active.id));
    const newIdx = flatTaskIds.indexOf(String(over.id));
    if (oldIdx < 0 || newIdx < 0) return;
    onReorder(arrayMove(flatTaskIds, oldIdx, newIdx), String(active.id));
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

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={flatTaskIds} strategy={verticalListSortingStrategy}>
            {sections.map((section) => (
              <div key={section.group?.id ?? "__ungrouped"} className="timeline-section">
                {section.group ? (
                  <div className="timeline-row group-row">
                    <button
                      className="rail-cell group-cell"
                      onClick={() => onEditGroup(section.group!)}
                      title="Edit group"
                    >
                      <span className="group-dot" style={{ background: section.group.color }} />
                      {section.group.name}
                    </button>
                    <div className="track group-track" />
                  </div>
                ) : (
                  sections.length > 1 && (
                    <div className="timeline-row group-row">
                      <div className="rail-cell group-cell muted">Ungrouped</div>
                      <div className="track group-track" />
                    </div>
                  )
                )}
                {section.tasks.map((task) => (
                  <SortableTaskRow key={task.id} task={task} onEdit={() => onTaskClick(task)}>
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
                        liveClass={
                          task.status === "done"
                            ? "task-bar-done"
                            : liveCurrent.has(task.id)
                              ? "task-bar-current"
                              : ""
                        }
                        linkSelected={linkPredecessorId === task.id}
                        onClick={() => onTaskClick(task)}
                        onCommit={(s, d) => onTaskTimeChange(task.id, s, d)}
                        onLockedDragAttempt={() => onLockedDragAttempt(task)}
                      />
                    </div>
                  </SortableTaskRow>
                ))}
                {!readOnly && (
                  <div className="timeline-row task-row-line add-row">
                    <button
                      className="rail-cell task-cell add-cell"
                      onClick={() => onAddTask(section.group?.id ?? null)}
                    >
                      + Add task
                    </button>
                    <div className="track" />
                  </div>
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
