// Bottom sheet: take a photo or choose one from the gallery.
//
// `capture="environment"` opens the rear camera on Android (including the
// Capacitor app, which hands it to the system camera through the
// FileProvider in AndroidManifest) and iOS; desktop browsers ignore it
// and show the normal file picker.
import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Icon from './Icon';

const TIPS = [
  ['center_focus_strong', 'Fill the frame'],
  ['light_mode', 'Good light'],
  ['filter_1', 'One item'],
];

export default function PhotoSearchSheet({ open, onClose, onPick }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  function picked(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) { onClose(); onPick(file); }
  }

  return (
    <>
      {/* Inputs stay mounted so the picker result still arrives after the sheet closes. */}
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={picked} />
      <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={picked} />
      {/* Portal: a blurred (backdrop-filter) parent such as the Home
          header would otherwise trap this fixed overlay inside itself. */}
      {open && createPortal(
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/45" onClick={onClose}>
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="photo-sheet-h"
            onClick={(e) => e.stopPropagation()}
            className="anim-sheet w-full sm:max-w-md bg-surface rounded-t-3xl sm:rounded-3xl px-5 pt-3 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-elevation-3"
          >
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-outline-variant sm:hidden" aria-hidden="true" />
            <div className="flex items-start gap-3">
              <span className="w-11 h-11 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                <Icon name="photo_camera" className="text-[24px]" />
              </span>
              <div className="flex-1 min-w-0">
                <h2 id="photo-sheet-h" className="text-title-lg font-bold">Search with a photo</h2>
                <p className="text-sm text-on-surface-variant">Snap a product or pick a picture — we&apos;ll find it, or the closest match, on Yobou.</p>
              </div>
              <button type="button" onClick={onClose} className="p-1.5 -mr-1.5 rounded-full hover:bg-surface-low" aria-label="Close">
                <Icon name="close" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <button type="button" onClick={() => cameraRef.current?.click()} className="rounded-2xl bg-primary text-white p-4 flex flex-col items-center gap-1.5 font-semibold active:scale-[.98] transition-transform">
                <Icon name="photo_camera" className="text-[28px]" />
                Take a photo
              </button>
              <button type="button" onClick={() => galleryRef.current?.click()} className="rounded-2xl bg-surface-low border border-outline-variant/50 p-4 flex flex-col items-center gap-1.5 font-semibold active:scale-[.98] transition-transform">
                <Icon name="photo_library" className="text-[28px] text-primary" />
                Choose a photo
              </button>
            </div>

            <ul className="mt-4 flex justify-between gap-2 text-label-md text-on-surface-variant">
              {TIPS.map(([icon, label]) => (
                <li key={label} className="flex items-center gap-1"><Icon name={icon} className="text-[16px]" />{label}</li>
              ))}
            </ul>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
