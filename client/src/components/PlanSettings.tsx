import { useState } from "react";
import type { Plan, PlanMode } from "@cookplan/shared";
import { ALERT_LEAD_OPTIONS, MAX_HOB_RINGS, MAX_OVENS } from "@cookplan/shared";
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
  const [alertLeadMin, setAlertLeadMin] = useState(plan.alertLeadMin);
  const [ovens, setOvens] = useState(plan.ovens);
  const [hobRings, setHobRings] = useState(plan.hobRings);
  const [cooks, setCooks] = useState(plan.cooks);
  const plans = usePlanStore((s) => s.plans);
  const taken = planNameTaken(plans, name, plan.id);

  return (
    <Modal title="Plan settings" onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (taken) return;
          onSave({ ...plan, name: name.trim() || plan.name, mode, anchorTime, alertLeadMin, ovens, hobRings, cooks: Math.max(1, cooks) });
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
        <div className="field-row">
          <label>
            Ovens
            <input
              type="number"
              min={0}
              max={MAX_OVENS}
              value={ovens}
              onChange={(e) => setOvens(clampInt(e.target.value, MAX_OVENS))}
            />
          </label>
          <label>
            Hob rings
            <input
              type="number"
              min={0}
              max={MAX_HOB_RINGS}
              value={hobRings}
              onChange={(e) => setHobRings(clampInt(e.target.value, MAX_HOB_RINGS))}
            />
          </label>
          <label>
            Cooks
            <input type="number" min={1} max={10} value={cooks} onChange={(e) => setCooks(clampInt(e.target.value, 10))} />
          </label>
        </div>
        <p className="muted small">
          This plan's kitchen, used to warn about oven and hob clashes, and when more tasks need someone's hands at once than
          there are cooks. New plans start from My kitchen on the plan list.
        </p>
        <div className="field">
          <span id="lead-label">Warning before each task starts (live run)</span>
          <div className="seg" role="radiogroup" aria-labelledby="lead-label">
            {ALERT_LEAD_OPTIONS.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={alertLeadMin === m}
                onClick={() => setAlertLeadMin(m)}
              >
                {m} min
              </button>
            ))}
          </div>
        </div>
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

/** A whole number from 0 to max, from a number box (empty counts as 0). */
export function clampInt(value: string, max: number): number {
  const n = Math.round(Number(value));
  return Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
}
