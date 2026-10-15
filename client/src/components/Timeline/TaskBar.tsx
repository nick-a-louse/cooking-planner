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
  /** Live runs use a frozen forward mapping regardless of plan mode. */
  forceForward: boolean;
  locked: boolean;
  readOnly: boolean;
  liveClass: string;
  linkSelected: boolean;
  onClick: () => void;
  onCommit: (startMin: number, durationMin: number) => void;
  onLockedDragAttempt: () => void;
  /** Dragged up or down: bars only move in time; rows move by their name on the left. */
  onVerticalDrag: () => void;
}

export default function TaskBar({
  task,
  groups,
  pxPerMin,
  mode,
  anchorTime,
  endMin,
  forceForward,
  locked,
  readOnly,
  liveClass,
  linkSelected,
  onClick,
  onCommit,
  onLockedDragAttempt,
  onVerticalDrag,
}: Props) {
  const effMode = forceForward ? "forward" : mode;
  const drag = useBarDrag({
    startMin: task.startMin,
    durationMin: task.durationMin,
    pxPerMin,
    onCommit,
    onVerticalDrag,
  });
  const lockedGesture = useRef<{ x: number; y: number; warned: boolean } | null>(null);
  /** A drag attempt on a linked bar just ended: the click that follows isn't a real click. */
  const lockedDragged = useRef(false);

  const startMin = drag.live?.startMin ?? task.startMin;
  const durationMin = drag.live?.durationMin ?? task.durationMin;
  const left = startMin * pxPerMin;
  const width = Math.max(durationMin * pxPerMin, 8);
  const dragging = drag.live !== null;

  const startWall = wallClock(startMin, effMode, anchorTime, endMin);
  const endWall = wallClock(startMin + durationMin, effMode, anchorTime, endMin);

  const lockedHandlers = {
    onPointerDown: (e: React.PointerEvent) => {
      lockedGesture.current = { x: e.clientX, y: e.clientY, warned: false };
      // Keep getting moves once the pointer leaves the (thin) bar, e.g. when dragging up or down.
      try {
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Pointer already gone (a fast tap): nothing to track.
      }
    },
    onPointerMove: (e: React.PointerEvent) => {
      const g = lockedGesture.current;
      if (g && !g.warned && Math.hypot(e.clientX - g.x, e.clientY - g.y) > 12) {
        g.warned = true;
        // Up/down means "move the row", which works even for a linked task.
        if (Math.abs(e.clientY - g.y) > Math.abs(e.clientX - g.x)) onVerticalDrag();
        else onLockedDragAttempt();
      }
    },
    onPointerUp: () => {
      if (lockedGesture.current?.warned) {
        lockedDragged.current = true;
        setTimeout(() => (lockedDragged.current = false), 0);
      }
      lockedGesture.current = null;
    },
  };

  const moveHandlers = readOnly
    ? {}
    : locked
      ? lockedHandlers
      : {
          onPointerDown: (e: React.PointerEvent) => drag.onPointerDown(e, "move"),
          onPointerMove: drag.onPointerMove,
          onPointerUp: drag.onPointerUp,
          onPointerCancel: drag.onPointerCancel,
        };

  return (
    <div
      className={`task-bar${task.kind === "wait" ? " task-bar-wait" : ""}${dragging ? " task-bar-dragging" : ""}${linkSelected ? " task-bar-link-selected" : ""}${liveClass ? ` ${liveClass}` : ""}${readOnly ? " task-bar-readonly" : ""}`}
      role="button"
      tabIndex={0}
      style={{ left, width, background: taskColor(task, groups) }}
      title={task.name}
      {...moveHandlers}
      onClick={() => {
        if (!drag.shouldSuppressClick() && !lockedDragged.current) onClick();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") onClick();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {!locked && !readOnly && (
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
        {task.status === "done" && "✓ "}
        {locked && <span className="link-glyph">↳ </span>}
        {task.name}
      </span>
      {!readOnly && (
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
      )}
      {dragging && (
        <div className="drag-tooltip">
          {formatHM(startWall)} – {formatHM(endWall)}
        </div>
      )}
    </div>
  );
}
