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
//   toast.success('Added to cart', { action: { label: 'View cart', to: '/cart' } });
//   toast.addedToCart(product)   // the standard add-to-cart confirmation
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

function push(type, message, { action } = {}) {
  const id = nextId++;
  const item = { id, type, message, action: action || null, ts: Date.now() };
  // Keep at most 3 on screen so rapid taps don't stack a tower of toasts.
  queue = [...queue, item].slice(-3);
  emit();
  // Auto-dismiss after 4s (a little longer when there is an action to tap).
  setTimeout(() => dismiss(id), action ? 5000 : 4000);
  return id;
}

function dismiss(id) {
  const before = queue.length;
  queue = queue.filter((t) => t.id !== id);
  if (queue.length !== before) emit();
}

export const toast = {
  success: (msg, opts) => push('success', msg, opts),
  error: (msg, opts) => push('error', msg, opts),
  info: (msg, opts) => push('info', msg, opts),
  addedToCart: (product) => push('success', product?.name ? `Added ${product.name} to cart` : 'Added to cart', {
    action: { label: 'View cart', to: '/cart' },
  }),
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