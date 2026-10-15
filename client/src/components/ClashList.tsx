import type { Clash, PlanDoc, Task } from "@cookplan/shared";
import { formatHM, ovenLabel, planEndMin, wallClock } from "@cookplan/shared";

interface Props {
  doc: PlanDoc;
  clashes: Clash[];
  onOpenTask: (task: Task) => void;
}

/** The kitchen clashes in a plan, under the toolbar. Warnings only: the plan still saves and runs. */
export default function ClashList({ doc, clashes, onOpenTask }: Props) {
  if (clashes.length === 0) return null;
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
    <details className="clash-panel" open={clashes.length <= 3}>
      <summary>
        {clashes.length === 1 ? "1 kitchen clash" : `${clashes.length} kitchen clashes`}
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
      </ul>
    </details>
  );
}
