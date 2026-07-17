import { useMemo } from "react";
import type { Group, PlanDoc, Task } from "@cookplan/shared";
import { planEndMin } from "@cookplan/shared";
import TimeAxis from "./TimeAxis";
import TaskBar from "./TaskBar";

const PX_PER_MIN = 4;
const RAIL_W = 160;

interface Props {
  doc: PlanDoc;
  onEditTask: (task: Task) => void;
  onEditGroup: (group: Group) => void;
}

interface Section {
  group: Group | null;
  tasks: Task[];
}

export default function TimelineCanvas({ doc, onEditTask, onEditGroup }: Props) {
  const { plan, groups, tasks } = doc;
  const endMin = planEndMin(tasks);
  // Round the visible range up to the next half hour, with breathing room.
  const totalMin = Math.max(120, Math.ceil((endMin + 30) / 30) * 30);

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

  return (
    <div className="timeline-scroll">
      <div className="timeline-inner" style={{ width: RAIL_W + totalMin * PX_PER_MIN }}>
        <div className="timeline-row axis-header">
          <div className="rail-cell" />
          <TimeAxis
            totalMin={totalMin}
            pxPerMin={PX_PER_MIN}
            mode={plan.mode}
            anchorTime={plan.anchorTime}
            endMin={endMin}
          />
        </div>

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
              <div key={task.id} className="timeline-row task-row-line">
                <button className="rail-cell task-cell" onClick={() => onEditTask(task)}>
                  {task.name}
                </button>
                <div className="track">
                  <TaskBar
                    task={task}
                    groups={groups}
                    pxPerMin={PX_PER_MIN}
                    onClick={() => onEditTask(task)}
                  />
                </div>
              </div>
            ))}
            {section.tasks.length === 0 && (
              <div className="timeline-row task-row-line">
                <div className="rail-cell task-cell muted empty-hint">No tasks yet</div>
                <div className="track" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
