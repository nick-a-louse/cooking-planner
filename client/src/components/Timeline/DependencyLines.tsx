import type { Dep, Task } from "@cookplan/shared";

interface Props {
  tasks: Task[];
  deps: Dep[];
  taskRowY: Map<string, number>;
  pxPerMin: number;
  railW: number;
  width: number;
  height: number;
}

const BAR_MID = 20;
const BAR_TOP = 6;
const BAR_BOTTOM = 34;

export default function DependencyLines({ tasks, deps, taskRowY, pxPerMin, railW, width, height }: Props) {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return (
    <svg className="dep-lines" width={width} height={height} aria-hidden>
      <defs>
        <marker id="dep-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto">
          <path d="M0,0.5 L7,4 L0,7.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </marker>
      </defs>
      {deps.map((d) => {
        const pred = byId.get(d.predecessorId);
        const succ = byId.get(d.successorId);
        const y1Base = taskRowY.get(d.predecessorId);
        const y2Base = taskRowY.get(d.successorId);
        if (!pred || !succ || y1Base === undefined || y2Base === undefined) return null;
        const x1 = railW + (pred.startMin + pred.durationMin) * pxPerMin;
        const y1 = y1Base + BAR_MID;
        const x2 = railW + succ.startMin * pxPerMin;
        const y2 = y2Base + BAR_MID;
        let path: string;
        if (x2 >= x1 + 16) {
          // Room for a classic elbow: out of the predecessor's end, across,
          // and into the successor's left edge.
          path = `M ${x1} ${y1} L ${x1 + 7} ${y1} L ${x1 + 7} ${y2} L ${x2 - 2} ${y2}`;
        } else {
          // Successor starts at (or just after) the predecessor's end: drop
          // vertically into the successor's top or bottom edge instead of
          // doubling back into its side.
          const xEntry = x2 + 7;
          const yEntry = y2Base > y1Base ? y2Base + BAR_TOP - 2 : y2Base + BAR_BOTTOM + 2;
          path = `M ${x1} ${y1} L ${xEntry} ${y1} L ${xEntry} ${yEntry}`;
        }
        return (
          <path
            key={`${d.predecessorId}-${d.successorId}`}
            d={path}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            markerEnd="url(#dep-arrow)"
          />
        );
      })}
    </svg>
  );
}
