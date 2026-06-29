// toast — a tiny event-bus-backed snackbar host.
//
// Used for non-blocking feedback across the shopper app: cart success/fail,
// profile save, etc. The Order list uses its own in-page banner because it
// wants persistent visibility (linked to an order id) instead of a toast
// that floats and fades.
//
// Usage:
//   import { toast } from '../../lib/toast';
//   toast.success('Added to cart');
//   toast.error('Could not save');
//   toast.info('Free shipping unlocked');
//
// ToastHost (mounted once in App.jsx) subscribes and renders. The store is
// a tiny module-scope array + listeners — no Zustand needed for this scale.

const TYPES = {
  success: { icon: 'check_circle', cls: 'bg-tertiary text-white' },
  error: { icon: 'error', cls: 'bg-error text-white' },
  info: { icon: 'info', cls: 'bg-primary text-white' },
};

const listeners = new Set();
let queue = [];
let nextId = 1;

function emit() {
  for (const fn of listeners) {
    try { fn([...queue]); } catch { /* ignore */ }
  }
}

function push(type, message) {
  const id = nextId++;
  const item = { id, type, message, ts: Date.now() };
  queue = [...queue, item];
  emit();
  // Auto-dismiss after 4s.
  setTimeout(() => dismiss(id), 4000);
  return id;
}

function dismiss(id) {
  const before = queue.length;
  queue = queue.filter((t) => t.id !== id);
  if (queue.length !== before) emit();
}

export const toast = {
  success: (msg) => push('success', msg),
  error: (msg) => push('error', msg),
  info: (msg) => push('info', msg),
  dismiss,
};

export { dismiss };

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getTypeMeta(type) {
  return TYPES[type] || TYPES.info;
}