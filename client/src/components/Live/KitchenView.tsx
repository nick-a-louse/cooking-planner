import type { PlanDoc, Task } from "@cookplan/shared";
import { formatHM, liveWallClock, nowOffsetMin, taskColor } from "@cookplan/shared";
import { useNow } from "../../hooks/useNow";

interface Props {
  doc: PlanDoc;
  liveZeroAt: string;
  /** Mark a task done (goes through the usual "shift the schedule?" question). */
  onDone: (task: Task) => void;
  /** Open a task's details. */
  onOpen: (task: Task) => void;
}

/** How many upcoming tasks to list under "Next". */
const NEXT_COUNT = 4;

/** "12:05" for 12 min 5 s, "1:02:05" past an hour. */
function clock(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * The kitchen view of a live run: large text, readable from across the room.
 * "Now" is every task that should have started and isn't done, with time left (or how late it is)
 * and a Done button; "Next" is what's coming, with a countdown to each.
 */
export default function KitchenView({ doc, liveZeroAt, onDone, onOpen }: Props) {
  const now = useNow(1000);
  const nowMin = nowOffsetMin(liveZeroAt, now);
  const byStart = (a: Task, b: Task) => a.startMin - b.startMin || a.sortOrder - b.sortOrder;

  const current = doc.tasks.filter((t) => t.status !== "done" && t.startMin <= nowMin).sort(byStart);
  const next = doc.tasks
    .filter((t) => t.status === "pending" && t.startMin > nowMin)
    .sort(byStart)
    .slice(0, NEXT_COUNT);
  const groupName = (t: Task) => doc.groups.find((g) => g.id === t.groupId)?.name;

  if (current.length === 0 && next.length === 0) {
    return (
      <div className="kitchen kitchen-empty">
        <p className="kitchen-empty-title">All tasks done</p>
        <p className="muted">Press End run when you've finished.</p>
      </div>
    );
  }

  return (
    <div className="kitchen">
      <section className="kitchen-now" aria-label="Now">
        <h2 className="kitchen-heading">Now</h2>
        {current.length === 0 && (
          <p className="kitchen-idle">Nothing to do right now. Next up at {formatHM(liveWallClock(next[0].startMin, liveZeroAt))}.</p>
        )}
        {current.map((t) => {
          const leftSec = (t.startMin + t.durationMin - nowMin) * 60;
          const late = leftSec < 0;
          return (
            <article key={t.id} className="kitchen-card" style={{ borderLeftColor: taskColor(t, doc.groups) }}>
              <button type="button" className="kitchen-card-main" onClick={() => onOpen(t)}>
                <span className="kitchen-meta">
                  {t.kind === "wait" ? "Waiting" : groupName(t) ?? "Task"} · until{" "}
                  {formatHM(liveWallClock(t.startMin + t.durationMin, liveZeroAt))}
                </span>
                <span className="kitchen-task">{t.name}</span>
                {t.notes && <span className="kitchen-notes">{t.notes}</span>}
              </button>
              <div className="kitchen-side">
                <span className={`kitchen-count g-figure${late ? " late" : ""}`}>
                  {late ? `+${clock(-leftSec)}` : clock(leftSec)}
                </span>
                <span className="kitchen-count-label">{late ? "over time" : "left"}</span>
                <button type="button" className="btn kitchen-done" onClick={() => onDone(t)}>
                  Done
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {next.length > 0 && (
        <section className="kitchen-next" aria-label="Next">
          <h2 className="kitchen-heading">Next</h2>
          {next.map((t) => (
            <button
              type="button"
              key={t.id}
              className="kitchen-next-row"
              style={{ borderLeftColor: taskColor(t, doc.groups) }}
              onClick={() => onOpen(t)}
            >
              <span className="kitchen-next-text">
                <span className="kitchen-next-task">{t.name}</span>
                <span className="kitchen-meta">
                  {t.kind === "wait" ? "Wait" : groupName(t) ?? "Task"} · at{" "}
                  {formatHM(liveWallClock(t.startMin, liveZeroAt))}
                </span>
              </span>
              <span className="kitchen-next-count g-figure">in {clock((t.startMin - nowMin) * 60)}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
