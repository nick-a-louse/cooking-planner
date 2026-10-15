import type { PlanDoc, Task } from "@cookplan/shared";
import { formatDuration, formatHM, liveWallClock, planEndMin, taskColor, wallClock } from "@cookplan/shared";

/**
 * What gets printed (screen: hidden; print: the only thing shown).
 * Page 1: the whole timeline on one page. Then: a timed checklist with tick boxes.
 * Built for black-and-white printers: names are always written out, colours are only a hint.
 */
export default function PrintView({ doc }: { doc: PlanDoc }) {
  const { plan } = doc;
  const endMin = planEndMin(doc.tasks);
  const liveZero = plan.status !== "draft" ? plan.liveStartedAt : null;
  const at = (m: number) => (liveZero ? liveWallClock(m, liveZero) : wallClock(m, plan.mode, plan.anchorTime, endMin));
  const groupName = (t: Task) => doc.groups.find((g) => g.id === t.groupId)?.name ?? "";
  const ordered = [...doc.tasks].sort((a, b) => a.startMin - b.startMin || a.sortOrder - b.sortOrder);
  const first = doc.tasks.length ? Math.min(...doc.tasks.map((t) => t.startMin)) : 0;
  const day = at(first).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="print-view">
      <section className="print-page">
        <h1 className="print-title">{plan.name}</h1>
        <p className="print-sub">
          {day} · {formatHM(at(first))} to {formatHM(at(endMin))}
          {plan.mode === "backward" && !liveZero ? ` (ready at ${formatHM(at(endMin))})` : ""}
        </p>
        {doc.tasks.length > 0 ? <PrintTimeline doc={doc} at={at} /> : <p>No tasks yet.</p>}
      </section>

      <section className="print-page print-break">
        <h2 className="print-heading">Checklist</h2>
        <table className="print-table">
          <thead>
            <tr>
              <th className="print-tick" aria-label="Done" />
              <th className="num">Start</th>
              <th className="num">End</th>
              <th>Task</th>
              <th>Dish</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map((t) => (
              <tr key={t.id}>
                <td className="print-tick">
                  <span className="print-box" />
                </td>
                <td className="num">{formatHM(at(t.startMin))}</td>
                <td className="num">{formatHM(at(t.startMin + t.durationMin))}</td>
                <td>
                  <strong>{t.name}</strong>
                  {t.kind === "wait" && <span className="print-muted"> (wait)</span>}
                  <span className="print-muted"> · {formatDuration(t.durationMin)}</span>
                  {t.equipment && (
                    <span className="print-muted">
                      {" "}
                      · {t.equipment === "hob" ? "hob" : `oven${plan.ovens > 1 ? ` ${t.equipment.slice(5)}` : ""}`}
                      {t.ovenTemp != null && t.equipment !== "hob" ? ` ${t.ovenTemp}°C` : ""}
                    </span>
                  )}
                </td>
                <td>{groupName(t)}</td>
                <td className="print-notes">{t.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

/** The whole plan as one SVG that scales to the page width. */
function PrintTimeline({ doc, at }: { doc: PlanDoc; at: (m: number) => Date }) {
  const tasks = [...doc.tasks].sort((a, b) => {
    const ga = doc.groups.find((g) => g.id === a.groupId)?.sortOrder ?? Infinity;
    const gb = doc.groups.find((g) => g.id === b.groupId)?.sortOrder ?? Infinity;
    return ga - gb || a.sortOrder - b.sortOrder;
  });
  const start = Math.min(...tasks.map((t) => t.startMin));
  const end = planEndMin(tasks);
  const span = Math.max(30, end - start);
  // Tick every 15, 30 or 60 minutes, so there are roughly 8-16 labels.
  const step = span <= 180 ? 15 : span <= 480 ? 30 : 60;
  // Drawn in units that print at roughly 1 unit = 0.25 mm on A4, so 13 units of text is about 9 pt.
  const W = 720;
  const LABEL = 190;
  const ROW = 30;
  const AXIS = 26;
  const RIGHT = 22; // room for the last time label
  const H = AXIS + tasks.length * ROW + 6;
  const x = (m: number) => LABEL + ((m - start) / span) * (W - LABEL - RIGHT);
  const firstTick = Math.ceil(at(start).getMinutes() / step) * step - at(start).getMinutes() + start;
  const ticks: number[] = [];
  for (let m = firstTick; m <= end; m += step) ticks.push(m);

  return (
    <svg className="print-timeline" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Timeline of the plan">
      {ticks.map((m) => (
        <g key={m}>
          <line x1={x(m)} x2={x(m)} y1={AXIS - 4} y2={H} stroke="#bbb" strokeWidth="0.6" />
          <text x={x(m)} y={AXIS - 9} fontSize="11" textAnchor="middle" fill="#333">
            {formatHM(at(m))}
          </text>
        </g>
      ))}
      {tasks.map((t, i) => {
        const y = AXIS + i * ROW;
        const colour = taskColor(t, doc.groups);
        const x1 = x(t.startMin);
        const w = Math.max(2, x(t.startMin + t.durationMin) - x1);
        return (
          <g key={t.id}>
            <text x={2} y={y + ROW / 2 + 4.5} fontSize="13" fill="#000">
              {t.name.length > 26 ? `${t.name.slice(0, 25)}…` : t.name}
            </text>
            <rect
              x={x1}
              y={y + 5}
              width={w}
              height={ROW - 10}
              rx="3"
              fill={colour}
              fillOpacity={t.kind === "wait" ? 0.15 : 0.35}
              stroke={colour}
              strokeWidth="1.5"
              strokeDasharray={t.kind === "wait" ? "4 3" : undefined}
            />
          </g>
        );
      })}
    </svg>
  );
}
