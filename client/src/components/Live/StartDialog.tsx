import type { PlanDoc } from "@cookplan/shared";
import { formatHM, planEndMin, wallClock } from "@cookplan/shared";
import Modal from "../Modal";

interface Props {
  doc: PlanDoc;
  onStart: (liveZeroAtIso: string) => void;
  onClose: () => void;
}

export default function StartDialog({ doc, onStart, onClose }: Props) {
  const endMin = planEndMin(doc.tasks);
  const plannedZero = wallClock(0, doc.plan.mode, doc.plan.anchorTime, endMin);
  const plannedFinish = wallClock(endMin, doc.plan.mode, doc.plan.anchorTime, endMin);
  const now = new Date();
  const nowFinish = new Date(now.getTime() + endMin * 60_000);

  return (
    <Modal title="Start cooking" onClose={onClose}>
      <div className="start-options">
        <button className="start-option" onClick={() => onStart(plannedZero.toISOString())}>
          <span className="start-option-title">Keep planned times</span>
          <span className="muted small">
            First task {formatHM(plannedZero)} · finish {formatHM(plannedFinish)}
          </span>
        </button>
        <button className="start-option" onClick={() => onStart(now.toISOString())}>
          <span className="start-option-title">Start now</span>
          <span className="muted small">
            First task {formatHM(now)} · finish about {formatHM(nowFinish)}
          </span>
        </button>
      </div>
    </Modal>
  );
}
