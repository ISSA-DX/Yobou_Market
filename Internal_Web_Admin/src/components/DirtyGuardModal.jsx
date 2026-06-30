// Confirm-discard modal — used when the admin tries to navigate away
// from a product form with unsaved changes. Single-purpose, kept tiny
// so the form page stays the focus of attention.
import Modal from './Modal';
import Icon from './Icon';

export default function DirtyGuardModal({ open, onDiscard, onKeep }) {
  return (
    <Modal
      open={open}
      onClose={onKeep}
      title="Discard changes?"
      footer={
        <>
          <button type="button" onClick={onKeep} className="btn-secondary">Keep editing</button>
          <button type="button" onClick={onDiscard} className="btn-primary bg-error hover:bg-error/90">
            <Icon name="delete" className="text-[18px]" /> Discard
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm text-on-surface-variant">
        <p>
          You have unsaved changes on this product. If you leave now, your work will be lost.
        </p>
        <p className="text-label-md">
          Tip: your draft is also saved automatically to this browser for 24 hours.
        </p>
      </div>
    </Modal>
  );
}