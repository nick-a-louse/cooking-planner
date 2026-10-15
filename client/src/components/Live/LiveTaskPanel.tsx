import { useEffect, useState } from "react";
import type { PlanDoc, ShiftProposal, Task } from "@cookplan/shared";
import { formatDuration, liveWallClock, formatHM, nowOffsetMin, proposeShift } from "@cookplan/shared";
import Modal from "../Modal";

interface Props {
  doc: PlanDoc;
  task: Task;
  liveZeroAt: string;
  onComplete: (task: Task, actualEndMin: number, applyShift: boolean) => void;
  onClose: () => void;
  /** Mark it done straight away (the kitchen view's Done button); still asks about shifting. */
  markDoneNow?: boolean;
}

export default function LiveTaskPanel({ doc, task, liveZeroAt, onComplete, onClose, markDoneNow }: Props) {
  const [proposal, setProposal] = useState<ShiftProposal | null>(null);
  const [pendingEndMin, setPendingEndMin] = useState(0);

  const start = liveWallClock(task.startMin, liveZeroAt);
  const end = liveWallClock(task.startMin + task.durationMin, liveZeroAt);
  const done = task.status === "done";

  const handleDone = () => {
    const actualEndMin = Math.round(nowOffsetMin(liveZeroAt, new Date()));
    const p = proposeShift(doc.tasks, doc.deps, task.id, actualEndMin);
    if (!p) {
      onComplete(task, actualEndMin, false);
      return;
    }
    setPendingEndMin(actualEndMin);
    setProposal(p);
  };

  useEffect(() => {
    if (markDoneNow && task.status !== "done") handleDone();
    // Run once when opened; handleDone reads the latest props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Done with nothing to shift completes at once: don't flash the panel.
  if (markDoneNow && !proposal && task.status !== "done") return null;

  return (
    <Modal title={task.kind === "wait" ? `⏸ ${task.name}` : task.name} onClose={onClose}>
      <p className="live-times">
        {formatHM(start)} – {formatHM(end)} · {formatDuration(task.durationMin)}
      </p>
      {task.notes && <p className="live-notes">{task.notes}</p>}
      <p className="muted small">
        {doc.plan.status === "done"
          ? "This run has finished, so the plan is locked. Press Edit plan again on the toolbar to change it."
          : "The plan is running, so it can't be edited. To change it, press End run, then Edit plan again."}
      </p>

      {proposal ? (
        <div className="shift-confirm">
          <p>
            Finished <strong>{Math.abs(proposal.deltaMin)} min {proposal.deltaMin > 0 ? "late" : "early"}</strong>.
            Shift {proposal.affectedTaskIds.length} following task
            {proposal.affectedTaskIds.length === 1 ? "" : "s"} to match?
          </p>
          <ul className="shift-list small muted">
            {proposal.affectedTaskIds.map((id) => {
              const t = doc.tasks.find((x) => x.id === id);
              if (!t) return null;
              const oldStart = liveWallClock(t.startMin, liveZeroAt);
              const newStart = liveWallClock(t.startMin + proposal.deltaMin, liveZeroAt);
              return (
                <li key={id}>
                  {t.name}: {formatHM(oldStart)} → {formatHM(newStart)}
                </li>
              );
            })}
          </ul>
          <div className="editor-actions">
            <button onClick={() => onComplete(task, pendingEndMin, false)}>Just mark done</button>
            <span className="spacer" />
            <button className="btn-primary" onClick={() => onComplete(task, pendingEndMin, true)}>
              Shift schedule
            </button>
          </div>
        </div>
      ) : (
        <div className="editor-actions">
          <span className="spacer" />
          <button onClick={onClose}>Close</button>
          {!done && (
            <button className="btn-primary" onClick={handleDone}>
              ✓ Done
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
