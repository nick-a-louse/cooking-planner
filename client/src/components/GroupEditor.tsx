import { useState } from "react";
import type { Group } from "@cookplan/shared";
import Modal from "./Modal";
import SwatchPicker from "./SwatchPicker";

interface Props {
  group: Group;
  onSave: (updated: Group) => void;
  onDelete: (groupId: string) => void;
  onClose: () => void;
}

export default function GroupEditor({ group, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(group.name);
  const [color, setColor] = useState(group.color);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <Modal title="Edit group" onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave({ ...group, name: name.trim() || group.name, color });
        }}
      >
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </label>
        <div className="swatch-field">
          <span className="swatch-label">Colour</span>
          <SwatchPicker value={color} onChange={setColor} />
        </div>
        <div className="editor-actions">
          {confirmingDelete ? (
            <button type="button" className="btn-danger" onClick={() => onDelete(group.id)}>
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
      <p className="muted small">Deleting a group keeps its tasks (they become ungrouped).</p>
    </Modal>
  );
}
