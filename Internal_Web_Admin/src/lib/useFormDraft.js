// useFormDraft — localStorage-backed autosave + restore-prompt for the
// admin product form. The intent is to never lose a half-typed product:
//
//   - Every 1.5s after the form changes, we write the form state to
//     localStorage under a versioned key.
//   - On mount, we read the entry; if it exists and is younger than
//     `maxAgeMs`, the consumer shows a "Restore unsaved draft?" prompt
//     and either rehydrates the form or discards the draft.
//   - On a successful save (publish), the consumer calls `clearDraft()`
//     so the next visit starts clean.
//
// The hook is generic — it accepts any JSON-serialisable form object —
// because the admin product form is the only consumer today but the
// partner form could share it later.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useFormDraft(key, form, { delay = 1500, maxAgeMs = 1000 * 60 * 60 * 24 } = {}) {
  const [pendingDraft, setPendingDraft] = useState(null); // { savedAt, form } | null
  const timerRef = useRef(null);

  // On mount, look for an unsaved draft.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object' || !parsed.savedAt || !parsed.form) return;
      const age = Date.now() - Number(parsed.savedAt);
      if (age < 0 || age > maxAgeMs) {
        localStorage.removeItem(key);
        return;
      }
      setPendingDraft(parsed);
    } catch {
      // localStorage may be unavailable (private mode, quota). Fail silent.
    }
  // We only want to run this on mount; the form ref isn't a dep.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Debounced autosave on form change.
  useEffect(() => {
    if (!form) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), form }));
      } catch {
        // Storage quota / private mode — ignore.
      }
    }, delay);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [form, key, delay]);

  const restoreDraft = useCallback(() => {
    if (!pendingDraft) return null;
    const form = pendingDraft.form;
    setPendingDraft(null);
    return form;
  }, [pendingDraft]);

  const dismissDraft = useCallback(() => {
    try { localStorage.removeItem(key); } catch {}
    setPendingDraft(null);
  }, [key]);

  const clearDraft = useCallback(() => {
    try { localStorage.removeItem(key); } catch {}
    setPendingDraft(null);
  }, [key]);

  return { pendingDraft, restoreDraft, dismissDraft, clearDraft };
}