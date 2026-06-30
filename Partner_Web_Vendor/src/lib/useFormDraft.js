// useFormDraft — localStorage-backed autosave + restore-prompt for the
// partner product form. Same semantics as the admin's version — see
// Internal_Web_Admin/src/lib/useFormDraft.js for the rationale.
import { useCallback, useEffect, useRef, useState } from 'react';

export function useFormDraft(key, form, { delay = 1500, maxAgeMs = 1000 * 60 * 60 * 24 } = {}) {
  const [pendingDraft, setPendingDraft] = useState(null);
  const timerRef = useRef(null);

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
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!form) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), form }));
      } catch {}
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