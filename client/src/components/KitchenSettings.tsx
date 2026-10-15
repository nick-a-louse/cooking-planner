import { useEffect, useState } from "react";
import { MAX_HOB_RINGS, MAX_OVENS } from "@cookplan/shared";
import Modal from "./Modal";
import WholeNumberInput from "./WholeNumberInput";
import { api } from "../api/client";

/** "My kitchen": the ovens and hob rings each new plan starts with. */
export default function KitchenSettings({ onClose }: { onClose: () => void }) {
  const [ovens, setOvens] = useState<number | null>(null);
  const [hobRings, setHobRings] = useState(4);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getKitchen()
      .then((k) => {
        setOvens(k.ovens);
        setHobRings(k.hobRings);
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <Modal title="My kitchen" onClose={onClose}>
      <form
        className="editor-form"
        onSubmit={async (e) => {
          e.preventDefault();
          if (ovens === null) return;
          try {
            await api.saveKitchen({ ovens, hobRings });
            onClose();
          } catch (err) {
            setError((err as Error).message);
          }
        }}
      >
        <p className="muted small">
          New plans start with this kitchen. The app warns when two dishes need the same oven at different
          temperatures, or more pans need the hob than you have rings. A plan can change its own copy in its settings,
          e.g. when cooking somewhere else.
        </p>
        <div className="field-row">
          <label>
            Ovens
            <WholeNumberInput
              min={0}
              max={MAX_OVENS}
              value={ovens ?? 0}
              disabled={ovens === null}
              onChange={setOvens}
              autoFocus
            />
          </label>
          <label>
            Hob rings
            <WholeNumberInput
              min={0}
              max={MAX_HOB_RINGS}
              value={hobRings}
              disabled={ovens === null}
              onChange={setHobRings}
            />
          </label>
        </div>
        {error && <p className="error small">{error}</p>}
        <div className="editor-actions">
          <span className="spacer" />
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={ovens === null}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}
