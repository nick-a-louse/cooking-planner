import { useRef } from "react";
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
  locked: boolean;
  linkSelected: boolean;
  onClick: () => void;
  onCommit: (startMin: number, durationMin: number) => void;
  onLockedDragAttempt: () => void;
}

export default function TaskBar({
  task,
  groups,
  pxPerMin,
  mode,
  anchorTime,
  endMin,
  locked,
  linkSelected,
  onClick,
  onCommit,
  onLockedDragAttempt,
}: Props) {
  const drag = useBarDrag({
    startMin: task.startMin,
    durationMin: task.durationMin,
    pxPerMin,
    onCommit,
  });
  const lockedGesture = useRef<{ x: number; y: number; warned: boolean } | null>(null);

  const startMin = drag.live?.startMin ?? task.startMin;
  const durationMin = drag.live?.durationMin ?? task.durationMin;
  const left = startMin * pxPerMin;
  const width = Math.max(durationMin * pxPerMin, 8);
  const dragging = drag.live !== null;

  const startWall = wallClock(startMin, mode, anchorTime, endMin);
  const endWall = wallClock(startMin + durationMin, mode, anchorTime, endMin);

  const lockedHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      lockedGesture.current = { x: e.clientX, y: e.clientY, warned: false };
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = lockedGesture.current;
      if (g && !g.warned && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) {
        g.warned = true;
        onLockedDragAttempt();
      }
    },
    onPointerUp: () => {
      lockedGesture.current = null;
    },
  };

  const moveHandlers = locked
    ? lockedHandlers
    : {
        onPointerDown: (e: React.PointerEvent) => drag.onPointerDown(e, "move"),
        onPointerMove: drag.onPointerMove,
        onPointerUp: drag.onPointerUp,
        onPointerCancel: drag.onPointerCancel,
      };

  return (
    <div
      className={`task-bar${task.kind === "wait" ? " task-bar-wait" : ""}${dragging ? " task-bar-dragging" : ""}${linkSelected ? " task-bar-link-selected" : ""}`}
      role="button"
      tabIndex={0}
      style={{ left, width, background: taskColor(task, groups) }}
      title={task.name}
      {...moveHandlers}
      onClick={() => {
        if (!drag.shouldSuppressClick()) onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!locked && (
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
      )}
      <span className="task-bar-label">
        {locked && <span className="link-glyph">↳ </span>}
        {task.name}
      </span>
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
