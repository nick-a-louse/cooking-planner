import { useState } from "react";
import type { Plan, PlanMode } from "@cookplan/shared";
import Modal from "./Modal";
import { planNameTaken } from "./PlanList";
import { usePlanStore } from "../state/planStore";

interface Props {
  plan: Plan;
  onSave: (updated: Plan) => void;
  onSaveAsTemplate: () => void;
  /** Present when the plan has a live/finished run that can be reset to draft. */
  onResetRun?: () => void;
  onClose: () => void;
}

export default function PlanSettings({ plan, onSave, onSaveAsTemplate, onResetRun, onClose }: Props) {
  const [name, setName] = useState(plan.name);
  const [mode, setMode] = useState<PlanMode>(plan.mode);
  const [anchorTime, setAnchorTime] = useState(plan.anchorTime);
  const plans = usePlanStore((s) => s.plans);
  const taken = planNameTaken(plans, name, plan.id);

  return (
    <Modal title="Plan settings" onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (taken) return;
          onSave({ ...plan, name: name.trim() || plan.name, mode, anchorTime });
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {taken && <p className="error small">A plan with this name already exists.</p>}
        <fieldset className="preds-field">
          <legend className="swatch-label">Scheduling</legend>
          <label className="pred-option">
            <input
              type="radio"
              name="mode"
              checked={mode === "forward"}
              onChange={() => setMode("forward")}
            />
            Forward — plan starts at a set time
          </label>
          <label className="pred-option">
            <input
              type="radio"
              name="mode"
              checked={mode === "backward"}
              onChange={() => setMode("backward")}
            />
            Backward — plan finishes at a set time
          </label>
        </fieldset>
        <label>
          {mode === "forward" ? "Start time" : "Finish time (e.g. when dinner is served)"}
          <input
            type="datetime-local"
            value={anchorTime}
            onChange={(e) => setAnchorTime(e.target.value)}
            required
          />
        </label>
        {mode === "backward" && (
          <p className="muted small">
            The last task ends exactly at this time — every task's start is worked out backward from it.
          </p>
        )}
        <div className="editor-actions">
          <button type="button" onClick={onSaveAsTemplate}>
            Save as template
          </button>
          {onResetRun && (
            <button type="button" className="btn-danger-outline" onClick={onResetRun}>
              Reset run
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={taken}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
