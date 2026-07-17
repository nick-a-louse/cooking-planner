import { useEffect, useState } from "react";
import { usePlanStore } from "../state/planStore";

export default function PlanList() {
  const { plans, plansLoading, error, loadPlans, createPlan, deletePlan, openPlan } = usePlanStore();
  const [newName, setNewName] = useState("");

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const realPlans = plans.filter((p) => !p.isTemplate);

  return (
    <div className="plan-list">
      <h1>🍳 Cooking Planner</h1>

      <form
        className="new-plan-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!newName.trim()) return;
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
        <button type="submit" disabled={!newName.trim()}>
          Create
        </button>
      </form>

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
    </div>
  );
}
