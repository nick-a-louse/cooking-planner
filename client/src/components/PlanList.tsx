import { useEffect, useRef, useState } from "react";
import type { PlanSummary } from "@cookplan/shared";
import Modal from "./Modal";
import AppHeader from "./AppHeader";
import AppFooter from "./AppFooter";
import KitchenSettings from "./KitchenSettings";
import ConfirmDialog from "./ConfirmDialog";
import { usePlanStore } from "../state/planStore";
import { api } from "../api/client";

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
  const [kitchenOpen, setKitchenOpen] = useState(false);
  const { plans, plansLoading, error, notice, loadPlans, createPlan, deletePlan, openPlan } = usePlanStore();
  const [newName, setNewName] = useState("");
  const [usingTemplate, setUsingTemplate] = useState<PlanSummary | null>(null);
  const [deleting, setDeleting] = useState<PlanSummary | null>(null);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const realPlans = plans.filter((p) => !p.isTemplate);
  const templates = plans.filter((p) => p.isTemplate);
  const newNameTaken = planNameTaken(plans, newName);
  // Updated line: the most recent change to any plan or template.
  const lastChange = plans.reduce((m, p) => (p.updatedAt > m ? p.updatedAt : m), "");
  const loaded = !(plansLoading && plans.length === 0);

  return (
    <>
    <AppHeader title="Cooking Planner" updatedIso={loaded ? lastChange : null} emptyText="No plans yet">
      <button className="btn btn-small" type="button" onClick={() => setKitchenOpen(true)}>
        My kitchen
      </button>
    </AppHeader>
    {kitchenOpen && <KitchenSettings onClose={() => setKitchenOpen(false)} />}
    <main className="wrap plan-list">

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
        <button type="submit" className="btn btn-primary" disabled={!newName.trim() || newNameTaken}>
          Create plan
        </button>
      </form>
      {newNameTaken && <p className="error small">A plan with this name already exists.</p>}

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
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
            <a className="plan-delete plan-export" href={api.exportUrl(p.id)} download title="Export to a file" aria-label={`Export ${p.name}`}>
              <DownloadIcon />
            </a>
            <button className="plan-delete" title="Delete plan" aria-label={`Delete ${p.name}`} onClick={() => setDeleting(p)}>
              <CrossIcon />
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
                  <span className="plan-name">{t.name}</span>
                  <span className="plan-meta">
                    {t.mode === "backward" ? "Backward" : "Forward"} plan — tap to use
                  </span>
                </button>
                <a className="plan-delete plan-export" href={api.exportUrl(t.id)} download title="Export to a file to share" aria-label={`Export ${t.name}`}>
                  <DownloadIcon />
                </a>
                <button className="plan-delete" title="Delete template" aria-label={`Delete ${t.name}`} onClick={() => setDeleting(t)}>
                  <CrossIcon />
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <ShareAndBackUp hasPlans={plans.length > 0} />

      {usingTemplate && (
        <UseTemplateDialog template={usingTemplate} onClose={() => setUsingTemplate(null)} />
      )}
      {deleting && (
        <ConfirmDialog
          title={deleting.isTemplate ? "Delete template" : "Delete plan"}
          message={`Delete "${deleting.name}"? This can't be undone.`}
          confirmLabel="Delete"
          onConfirm={() => void deletePlan(deleting.id)}
          onClose={() => setDeleting(null)}
        />
      )}
    </main>
    <AppFooter />
    </>
  );
}

function CrossIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Import a file, or export everything. Importing always adds plans; it never replaces any. */
function ShareAndBackUp({ hasPlans }: { hasPlans: boolean }) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const importFile = async (file: File) => {
    setBusy(true);
    try {
      let parsed: unknown;
      try {
        parsed = JSON.parse(await file.text());
      } catch {
        throw new Error(`"${file.name}" isn't a Cooking Planner export (it isn't valid JSON).`);
      }
      const { imported } = await api.importPlans(parsed);
      const names = imported.map((p) => p.name);
      usePlanStore.setState({
        error: null,
        notice:
          names.length === 1
            ? `Imported "${names[0]}".`
            : `Imported ${names.length} plans and templates: ${names.slice(0, 5).join(", ")}${names.length > 5 ? ", …" : ""}.`,
      });
      await usePlanStore.getState().loadPlans();
    } catch (e) {
      usePlanStore.setState({ notice: null, error: `Import failed: ${(e as Error).message}` });
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = ""; // allow picking the same file again
    }
  };

  return (
    <section className="share-backup">
      <h2 className="section-title">Share and back up</h2>
      <p className="muted small">
        Export a plan or template (the arrow on its card) to share with someone else running Cooking Planner, or
        export everything as a backup. Importing always adds new plans; it never replaces yours.
      </p>
      <div className="share-actions">
        <button type="button" className="btn" disabled={busy} onClick={() => fileInput.current?.click()}>
          {busy ? "Importing…" : "Import a file"}
        </button>
        {hasPlans && (
          <a className="btn" href={api.exportAllUrl} download>
            Export all
          </a>
        )}
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFile(f);
          }}
        />
      </div>
    </section>
  );
}

function DownloadIcon() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}
