import { formatHM, wallClock } from "@cookplan/shared";
import type { PlanMode } from "@cookplan/shared";

interface Props {
  totalMin: number;
  pxPerMin: number;
  mode: PlanMode;
  anchorTime: string;
  endMin: number;
}

export default function TimeAxis({ totalMin, pxPerMin, mode, anchorTime, endMin }: Props) {
  const tickEvery = pxPerMin >= 4 ? 15 : 30;
  const ticks: number[] = [];
  for (let m = 0; m <= totalMin; m += tickEvery) ticks.push(m);

  return (
    <div className="time-axis" style={{ width: totalMin * pxPerMin }}>
      {ticks.map((m) => (
        <div key={m} className="axis-tick" style={{ left: m * pxPerMin }}>
          <span className="axis-label">
            {formatHM(wallClock(m, mode, anchorTime, endMin))}
          </span>
        </div>
      ))}
    </div>
  );
}
