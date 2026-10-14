// StatusBadge — the one status vocabulary for the whole system.
// IDENTICAL in APP_shopper_and_buyer, Partner_Web_Vendor and
// Internal_Web_Admin. Covers orders, deliveries, payouts, refunds,
// product changes, vendor applications and product visibility, so the
// same status always reads with the same colour and words everywhere.
// Styles: .badge-* in styles/index.css (Design System v2).
const MAP = {
  // Orders
  PLACED: ['neutral', 'Placed'],
  PAID: ['info', 'Paid'],
  PROCESSING: ['warning', 'Preparing'],
  SHIPPED: ['info', 'On the way'],
  DELIVERED: ['success', 'Delivered'],
  CANCELLED: ['danger', 'Cancelled'],
  REFUNDED: ['neutral', 'Refunded'],
  // Courier deliveries
  ASSIGNED: ['warning', 'Courier assigned'],
  PICKED_UP: ['info', 'Out for delivery'],
  FAILED: ['danger', 'Delivery failed'],
  // Review queues (changes, refunds, vendors, payouts)
  PENDING: ['warning', 'Pending'],
  REQUESTED: ['warning', 'Requested'],
  APPROVED: ['success', 'Approved'],
  PROCESSED: ['success', 'Refunded'],
  REJECTED: ['danger', 'Rejected'],
  SUSPENDED: ['danger', 'Suspended'],
  // Product visibility
  LIVE: ['success', 'Live'],
  DRAFT: ['neutral', 'Draft'],
  HIDDEN: ['neutral', 'Hidden'],
};

// Full class names written out so Tailwind keeps them in the build
// (a template like `badge-${tone}` is invisible to its content scanner).
const TONE_CLASS = {
  success: 'badge-success',
  warning: 'badge-warning',
  danger: 'badge-danger',
  info: 'badge-info',
  neutral: 'badge-neutral',
};

export function statusTone(status) {
  return (MAP[status] || ['neutral'])[0];
}

export function statusLabel(status) {
  return (MAP[status] || [null, status ? String(status).replace(/_/g, ' ').toLowerCase() : '—'])[1];
}

export default function StatusBadge({ status, label, className = '' }) {
  const tone = statusTone(status);
  return (
    <span className={`${TONE_CLASS[tone]} ${className}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80" aria-hidden="true" />
      {label || statusLabel(status)}
    </span>
  );
}
