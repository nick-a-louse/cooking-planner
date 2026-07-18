import { useEffect, useState } from "react";
import type { PlanSummary } from "@cookplan/shared";
import Modal from "./Modal";
import { usePlanStore } from "../state/planStore";

/** Case-insensitive, trimmed name collision check against loaded plans. */
export function planNameTaken(plans: PlanSummary[], name: string, excludeId?: string): boolean {
  const n = name.trim().toLowerCase();
  return plans.some((p) => p.id !== excludeId && p.name.trim().toLowerCase() === n);
}

function UseTemplateDialog({
  template,
  onClose,
}: {
  template: PlanSummary;
  onClose: () => void;
}) {
  const useTemplate = usePlanStore((s) => s.useTemplate);
  const plans = usePlanStore((s) => s.plans);
  const [name, setName] = useState(template.name.replace(/\s*template$/i, ""));
  const [anchorTime, setAnchorTime] = useState(template.anchorTime);
  const taken = planNameTaken(plans, name);

  return (
    <Modal title="New plan from template" onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (taken || !name.trim()) return;
          void useTemplate(template.id, name.trim(), anchorTime);
          onClose();
        }}
      >
        <label>
          Plan name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        {taken && <p className="error small">A plan with this name already exists — pick another.</p>}
        <label>
          {template.mode === "backward" ? "Finish time" : "Start time"}
          <input
            type="datetime-local"
            value={anchorTime}
            onChange={(e) => setAnchorTime(e.target.value)}
            required
          />
        </label>
        <div className="editor-actions">
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={taken || !name.trim()}>
            Create plan
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function PlanList() {
  const { plans, plansLoading, error, loadPlans, createPlan, deletePlan, openPlan } = usePlanStore();
  const [newName, setNewName] = useState("");
  const [usingTemplate, setUsingTemplate] = useState<PlanSummary | null>(null);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const realPlans = plans.filter((p) => !p.isTemplate);
  const templates = plans.filter((p) => p.isTemplate);
  const newNameTaken = planNameTaken(plans, newName);

  return (
    <div className="plan-list">
      <h1>🍳 Cooking Planner</h1>

      <form
        className="new-plan-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim() || newNameTaken) return;
          void createPlan(newName.trim());
          setNewName("");
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New plan name, e.g. Christmas Dinner"
          aria-label="New plan name"
        />
        <button type="submit" disabled={!newName.trim() || newNameTaken}>
          Create
        </button>
      </form>
      {newNameTaken && <p className="error small">A plan with this name already exists.</p>}

      {error && <p className="error">{error}</p>}
      {plansLoading && plans.length === 0 && <p className="muted">Loading…</p>}
      {!plansLoading && realPlans.length === 0 && (
        <p className="muted">No plans yet — create your first meal plan above.</p>
      )}

      <ul className="plan-cards">
        {realPlans.map((p) => (
          <li key={p.id} className="plan-card">
            <button className="plan-open" onClick={() => void openPlan(p.id)}>
              <span className="plan-name">{p.name}</span>
              <span className="plan-meta">
                {p.mode === "backward" ? "Finish" : "Start"}{" "}
                {p.anchorTime.replace("T", " ")} · {p.status}
              </span>
            </button>
            <button
              className="plan-delete"
              title="Delete plan"
              onClick={() => {
                if (confirm(`Delete "${p.name}"?`)) void deletePlan(p.id);
              }}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      {templates.length > 0 && (
        <>
          <h2 className="section-title">Templates</h2>
          <ul className="plan-cards">
            {templates.map((t) => (
              <li key={t.id} className="plan-card">
                <button className="plan-open" onClick={() => setUsingTemplate(t)}>
                  <span className="plan-name">📋 {t.name}</span>
                  <span className="plan-meta">
                    {t.mode === "backward" ? "Backward" : "Forward"} plan — tap to use
                  </span>
                </button>
                <button
                  className="plan-delete"
                  title="Delete template"
                  onClick={() => {
                    if (confirm(`Delete template "${t.name}"?`)) void deletePlan(t.id);
                  }}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      {usingTemplate && (
        <UseTemplateDialog template={usingTemplate} onClose={() => setUsingTemplate(null)} />
      )}
    </div>
  );
}
