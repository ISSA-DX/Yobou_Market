// Search by photo — client side.
//
// The shopper picks or takes a photo (PhotoSearchSheet); we shrink it on
// the device (phone photos are often 4–12 MB) and POST it to
// /api/search/image. The latest search lives here, outside React, so the
// results survive a trip to a product page and back.
import { useSyncExternalStore } from 'react';
import { apiForm } from '../api';

const MAX_EDGE = 1280;

/** Downscale + re-encode as JPEG. Falls back to the original file. */
export async function shrinkPhoto(file, maxEdge = MAX_EDGE) {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024) { bmp.close?.(); return file; }
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bmp.width * scale));
    canvas.height = Math.max(1, Math.round(bmp.height * scale));
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close?.();
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    return blob || file;
  } catch {
    return file;
  }
}

/** Friendly message for a failed photo search. */
export function photoSearchError(e) {
  if (e?.code === 'NETWORK_ERROR') return 'No connection. Check your internet and try again.';
  if (e?.status === 429) return 'Too many photo searches in a row. Please wait a minute.';
  if (e?.status === 413) return 'That photo is too large. Try another one.';
  if (e?.status === 400) return e?.data?.message || 'We could not read that photo. Try a JPEG or PNG.';
  return 'Photo search is not available right now. Please try again.';
}

let session = null; // { id, previewUrl, status: 'loading'|'done'|'error', result, error }
const listeners = new Set();
const emit = () => listeners.forEach((fn) => fn());
const set = (patch) => { session = { ...session, ...patch }; emit(); };

export function startPhotoSearch(file) {
  if (session?.previewUrl) URL.revokeObjectURL(session.previewUrl);
  const id = Date.now();
  session = { id, previewUrl: URL.createObjectURL(file), status: 'loading', result: null, error: '' };
  emit();
  (async () => {
    try {
      const fd = new FormData();
      fd.append('image', await shrinkPhoto(file), 'photo.jpg');
      const result = await apiForm('/api/search/image', { body: fd });
      if (session?.id === id) set({ status: 'done', result });
    } catch (e) {
      if (session?.id === id) set({ status: 'error', error: photoSearchError(e) });
    }
  })();
}

export function usePhotoSession() {
  return useSyncExternalStore(
    (fn) => { listeners.add(fn); return () => listeners.delete(fn); },
    () => session,
  );
}
