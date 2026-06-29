import { useEffect, useState } from 'react';
import Icon from './Icon';
import { subscribe, dismiss, getTypeMeta } from '../lib/toast';

// Renders active toasts at the bottom of the screen, above the bottom nav.
// Mounted once in App.jsx.
export default function ToastHost() {
  const [items, setItems] = useState([]);

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
          <button
            key={t.id}
            onClick={() => dismiss(t.id)}
            className={`pointer-events-auto max-w-md shadow-float rounded-full px-4 py-2.5 flex items-center gap-2 ${meta.cls}`}
          >
            <Icon name={meta.icon} className="text-[18px]" />
            <span className="text-sm font-medium">{t.message}</span>
          </button>
        );
      })}
    </div>
  );
}