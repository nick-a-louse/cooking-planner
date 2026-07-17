import type { Group, PlanMode, Task } from "@cookplan/shared";
import { formatHM, taskColor, wallClock } from "@cookplan/shared";
import { useBarDrag } from "../../hooks/useBarDrag";

interface Props {
  task: Task;
  groups: Group[];
  pxPerMin: number;
  mode: PlanMode;
  anchorTime: string;
  endMin: number;
  onClick: () => void;
  onCommit: (startMin: number, durationMin: number) => void;
}

export default function TaskBar({
  task,
  groups,
  pxPerMin,
  mode,
  anchorTime,
  endMin,
  onClick,
  onCommit,
}: Props) {
  const drag = useBarDrag({
    startMin: task.startMin,
    durationMin: task.durationMin,
    pxPerMin,
    onCommit,
  });

  const startMin = drag.live?.startMin ?? task.startMin;
  const durationMin = drag.live?.durationMin ?? task.durationMin;
  const left = startMin * pxPerMin;
  const width = Math.max(durationMin * pxPerMin, 8);
  const dragging = drag.live !== null;

  const startWall = wallClock(startMin, mode, anchorTime, endMin);
  const endWall = wallClock(startMin + durationMin, mode, anchorTime, endMin);

  return (
    <div
      className={`task-bar${dragging ? " task-bar-dragging" : ""}`}
      role="button"
      tabIndex={0}
      style={{ left, width, background: taskColor(task, groups) }}
      title={task.name}
      onPointerDown={(e) => drag.onPointerDown(e, "move")}
      onPointerMove={drag.onPointerMove}
      onPointerUp={drag.onPointerUp}
      onPointerCancel={drag.onPointerCancel}
      onClick={() => {
        if (!drag.shouldSuppressClick()) onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <span
        className="bar-handle handle-l"
        onPointerDown={(e) => {
          e.stopPropagation();
          drag.onPointerDown(e, "resize-l");
        }}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
      />
      <span className="task-bar-label">{task.name}</span>
      <span
        className="bar-handle handle-r"
        onPointerDown={(e) => {
          e.stopPropagation();
          drag.onPointerDown(e, "resize-r");
        }}
        onPointerMove={drag.onPointerMove}
        onPointerUp={drag.onPointerUp}
        onPointerCancel={drag.onPointerCancel}
      />
      {dragging && (
        <div className="drag-tooltip">
          {formatHM(startWall)} – {formatHM(endWall)}
        </div>
      )}
    </div>
  );
}
