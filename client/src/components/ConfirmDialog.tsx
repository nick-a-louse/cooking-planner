import Modal from "./Modal";

interface Props {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onClose: () => void;
}

/** In-page confirmation, used instead of the browser's confirm() pop-up. */
export default function ConfirmDialog({ title, message, confirmLabel, onConfirm, onClose }: Props) {
  return (
    <Modal title={title} onClose={onClose}>
      <p className="confirm-message">{message}</p>
      <div className="editor-actions">
        <span className="spacer" />
        <button type="button" onClick={onClose} autoFocus>
          Cancel
        </button>
        <button
          type="button"
          className="btn-danger"
          onClick={() => {
            onConfirm();
            onClose();
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
