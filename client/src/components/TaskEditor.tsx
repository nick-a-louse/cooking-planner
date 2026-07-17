import { useState } from "react";
import type { PlanDoc, Task } from "@cookplan/shared";
import {
  DEFAULT_TASK_COLOR,
  formatHM,
  planEndMin,
  predecessorsOf,
  snapDuration,
  snapMin,
  wallClock,
  wouldCreateCycle,
} from "@cookplan/shared";
import Modal from "./Modal";
import SwatchPicker from "./SwatchPicker";

interface Props {
  doc: PlanDoc;
  task: Task;
  onSave: (updated: Task, predecessorIds: string[]) => void;
  onDelete: (taskId: string) => void;
  onClose: () => void;
}

/** Convert a wall-clock "HH:MM" (on the anchor's date) back to an internal-timeline offset. */
function timeInputToOffset(hhmm: string, doc: PlanDoc, endMin: number): number {
  const anchor = new Date(doc.plan.anchorTime);
  const [h, m] = hhmm.split(":").map(Number);
  const wall = new Date(anchor);
  wall.setHours(h, m, 0, 0);
  const deltaMin = Math.round((wall.getTime() - anchor.getTime()) / 60_000);
  const offset = doc.plan.mode === "forward" ? deltaMin : deltaMin + endMin;
  return snapMin(offset);
}

export default function TaskEditor({ doc, task, onSave, onDelete, onClose }: Props) {
  const endMin = planEndMin(doc.tasks);
  const [name, setName] = useState(task.name);
  const [groupId, setGroupId] = useState(task.groupId ?? "");
  const [startInput, setStartInput] = useState(
    formatHM(wallClock(task.startMin, doc.plan.mode, doc.plan.anchorTime, endMin)),
  );
  const [duration, setDuration] = useState(task.durationMin);
  const [color, setColor] = useState(task.color ?? DEFAULT_TASK_COLOR);
  const [notes, setNotes] = useState(task.notes);
  const [predIds, setPredIds] = useState<string[]>(predecessorsOf(task.id, doc.deps));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const grouped = groupId !== "";
  const hasPreds = predIds.length > 0;

  // Deps excluding this task's own incoming links — the base for cycle checks
  // when toggling predecessors on/off in the editor.
  const otherDeps = doc.deps.filter((d) => d.successorId !== task.id);
  const candidates = doc.tasks.filter((t) => t.id !== task.id);

  return (
    <Modal title="Edit task" onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(
            {
              ...task,
              name: name.trim() || task.name,
              groupId: groupId || null,
              startMin: hasPreds ? task.startMin : timeInputToOffset(startInput, doc, endMin),
              durationMin: snapDuration(duration),
              color: grouped ? null : color,
              notes,
            },
            predIds,
          );
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <label>
          Group
          <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Ungrouped</option>
            {doc.groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <div className="field-row">
          <label>
            Start
            <input
              type="time"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              disabled={hasPreds}
              title={hasPreds ? "Start follows the linked task" : undefined}
            />
          </label>
          <label>
            Duration (min)
            <input
              type="number"
              min={1}
              step={1}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
        </div>
        {hasPreds && <p className="muted small">Start is set automatically — this task begins when its linked task finishes.</p>}
        {candidates.length > 0 && (
          <fieldset className="preds-field">
            <legend className="swatch-label">Starts after</legend>
            <div className="preds-list">
              {candidates.map((t) => {
                const checked = predIds.includes(t.id);
                const cyclic = !checked && wouldCreateCycle(otherDeps, t.id, task.id);
                return (
                  <label key={t.id} className={`pred-option${cyclic ? " muted" : ""}`}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={cyclic}
                      onChange={(e) =>
                        setPredIds(
                          e.target.checked ? [...predIds, t.id] : predIds.filter((id) => id !== t.id),
                        )
                      }
                    />
                    {t.name}
                    {cyclic && <span className="small"> (would loop)</span>}
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}
        {!grouped && (
          <div className="swatch-field">
            <span className="swatch-label">Colour</span>
            <SwatchPicker value={color} onChange={setColor} />
          </div>
        )}
        {grouped && (
          <p className="muted small">Colour comes from the group.</p>
        )}
        <label>
          Notes
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. baste every 20 min"
          />
        </label>
        <div className="editor-actions">
          {confirmingDelete ? (
            <button type="button" className="btn-danger" onClick={() => onDelete(task.id)}>
              Really delete?
            </button>
          ) : (
            <button type="button" className="btn-danger-outline" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary">
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
