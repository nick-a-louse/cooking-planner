import PlanList from "./components/PlanList";
import { usePlanStore } from "./state/planStore";

export default function App() {
  const { doc, closePlan, saveState } = usePlanStore();

  if (!doc) return <PlanList />;

  return (
    <div className="plan-view">
      <header className="plan-header">
        <button onClick={closePlan}>← Plans</button>
        <h2>{doc.plan.name}</h2>
        <span className={`save-state save-${saveState}`}>
          {saveState === "saving" ? "Saving…" : saveState === "error" ? "Save failed" : "Saved"}
        </span>
      </header>
      <p className="muted" style={{ padding: "1rem" }}>
        Timeline coming in M2 — plan "{doc.plan.name}" has {doc.tasks.length} task(s).
      </p>
    </div>
  );
}
