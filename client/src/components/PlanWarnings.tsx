import type { Clash, Overload, PlanDoc, Task } from "@cookplan/shared";
import { formatHM, ovenLabel, planEndMin, wallClock } from "@cookplan/shared";

interface Props {
  doc: PlanDoc;
  clashes: Clash[];
  /** Stretches with more hands-on tasks than cooks. */
  busy: Overload[];
  onOpenTask: (task: Task) => void;
}

/** Planning warnings under the toolbar: kitchen clashes and hands-on overlaps. The plan still saves and runs. */
export default function PlanWarnings({ doc, clashes, busy, onOpenTask }: Props) {
  const total = clashes.length + busy.length;
  if (total === 0) return null;
  const parts = [
    clashes.length > 0 && (clashes.length === 1 ? "1 kitchen clash" : `${clashes.length} kitchen clashes`),
    busy.length > 0 && (busy.length === 1 ? "1 hands-on overlap" : `${busy.length} hands-on overlaps`),
  ].filter(Boolean);
  const endMin = planEndMin(doc.tasks);
  const at = (m: number) => formatHM(wallClock(m, doc.plan.mode, doc.plan.anchorTime, endMin));
  const byId = new Map(doc.tasks.map((t) => [t.id, t]));
  const name = (id: string) => {
    const t = byId.get(id);
    return t ? (
      <button type="button" className="link-button" onClick={() => onOpenTask(t)}>
        {t.name}
      </button>
    ) : null;
  };
  const list = (ids: string[]) =>
    ids.map((id, i) => (
      <span key={id}>
        {i > 0 && (i === ids.length - 1 ? " and " : ", ")}
        {name(id)}
      </span>
    ));

  return (
    <details className="clash-panel" open={total <= 3}>
      <summary>
        {parts.join(", ")}
        <span className="muted small"> · the plan still works, but check these</span>
      </summary>
      <ul>
        {clashes.map((c, i) => (
          <li key={i}>
            {c.kind === "oven-temp" && (
              <>
                <strong>{ovenLabel(c.oven, doc.plan.ovens)}, {at(c.fromMin)}–{at(c.toMin)}:</strong> {name(c.taskIds[0])} at{" "}
                {byId.get(c.taskIds[0])?.ovenTemp}°C and {name(c.taskIds[1])} at {byId.get(c.taskIds[1])?.ovenTemp}°C
              </>
            )}
            {c.kind === "hob" && (
              <>
                <strong>Hob, {at(c.fromMin)}–{at(c.toMin)}:</strong> {c.count} {c.count === 1 ? "pan" : "pans"} on {doc.plan.hobRings}{" "}
                {doc.plan.hobRings === 1 ? "ring" : "rings"} ({list(c.taskIds)})
              </>
            )}
            {c.kind === "missing-oven" && (
              <>
                {name(c.taskIds[0])} uses {ovenLabel(c.oven, 2)}, but this plan's kitchen has{" "}
                {doc.plan.ovens === 1 ? "1 oven" : `${doc.plan.ovens} ovens`}
              </>
            )}
          </li>
        ))}
        {busy.map((o, i) => (
          <li key={`busy-${i}`}>
            <strong>
              Hands-on, {at(o.fromMin)}–{at(o.toMin)}:
            </strong>{" "}
            {o.count} tasks need someone at once, with {doc.plan.cooks === 1 ? "1 cook" : `${doc.plan.cooks} cooks`} (
            {list(o.taskIds)})
          </li>
        ))}
      </ul>
    </details>
  );
}
