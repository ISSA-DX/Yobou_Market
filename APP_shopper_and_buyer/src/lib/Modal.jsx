import { useEffect } from 'react';
import Icon from '../components/Icon';

// Simple modal — backdrop + card, dismiss by clicking backdrop or Esc.
export default function Modal({ open, onClose, title, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) { if (e.key === 'Escape') onClose?.(); }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-outline-variant/30">
          <h2 className="font-bold text-lg">{title}</h2>
          <button onClick={onClose} className="p-1 rounded-md hover:bg-surface-low" aria-label="Close">
            <Icon name="close" />
          </button>
        </div>
        <div className="p-5 overflow-y-auto flex-1">{children}</div>
        {footer && (
          <div className="px-5 py-3 border-t border-outline-variant/30 flex justify-end gap-2 bg-surface-low">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}