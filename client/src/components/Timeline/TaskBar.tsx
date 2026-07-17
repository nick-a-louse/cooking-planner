import type { Group, Task } from "@cookplan/shared";
import { taskColor } from "@cookplan/shared";

interface Props {
  task: Task;
  groups: Group[];
  pxPerMin: number;
  onClick: () => void;
}

export default function TaskBar({ task, groups, pxPerMin, onClick }: Props) {
  const left = task.startMin * pxPerMin;
  const width = Math.max(task.durationMin * pxPerMin, 8);
  return (
    <button
      className="task-bar"
      style={{ left, width, background: taskColor(task, groups) }}
      onClick={onClick}
      title={task.name}
    >
      <span className="task-bar-label">{task.name}</span>
    </button>
  );
}
