import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { subscribe, dismiss, getTypeMeta } from '../lib/toast';

// Renders active toasts at the bottom of the screen, above the bottom nav.
// Mounted once in App.jsx.
export default function ToastHost() {
  const [items, setItems] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    const off = subscribe(setItems);
    return off;
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-20 z-40 px-4 flex flex-col gap-2 items-center pointer-events-none"
      aria-live="polite"
    >
      {items.map((t) => {
        const meta = getTypeMeta(t.type);
        return (
          // type="button" defensive fix: every toast closes through
          // this click handler, and without an explicit type the
          // Android Capacitor WebView has been seen to reload the
          // current document on tap (the same default-submit quirk
          // that was making PDP Add-to-Cart feel like a page
          // refresh). See the v0.3.9 commit message for the full
          // root-cause analysis.
          <div
            key={t.id}
            role={t.type === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto max-w-md w-max shadow-float rounded-full pl-4 pr-1.5 py-1.5 flex items-center gap-2 ${meta.cls}`}
          >
            <Icon name={meta.icon} className="text-[18px] shrink-0" />
            <span className="text-sm font-medium line-clamp-2 py-1">{t.message}</span>
            {t.action ? (
              <button
                type="button"
                onClick={() => {
                  dismiss(t.id);
                  if (t.action.href) window.open(t.action.href, '_blank', 'noopener');
                  else navigate(t.action.to);
                }}
                className="shrink-0 rounded-full bg-white/20 hover:bg-white/30 px-3 py-1.5 text-sm font-bold"
              >
                {t.action.label}
              </button>
            ) : null}
            <button type="button" onClick={() => dismiss(t.id)} className="shrink-0 w-8 h-8 rounded-full hover:bg-white/20 flex items-center justify-center" aria-label="Dismiss">
              <Icon name="close" className="text-[18px]" />
            </button>
          </div>
        );
      })}
    </div>
  );
}