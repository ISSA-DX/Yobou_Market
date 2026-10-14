// LiveTracking — courier tracking card for one order. Kept in sync across
// Internal_Web_Admin, Partner_Web_Vendor and APP_shopper_and_buyer.
//
// The server decides what each role may see (GET /api/orders/:id/tracking,
// see server/src/lib/tracking.js), so this one component renders:
//   customer → live courier while out for delivery + route since pickup
//   vendor   → courier heading to the store for pickup, then status only
//   admin    → live position, full route replay and proof-of-delivery point
// Live updates arrive over SSE (`event: courier`); a 30s poll is the fallback.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import Icon from './Icon';
import TrackingMap, { ago } from './TrackingMap';
import { useCourierStream, useNotificationStream } from '../lib/useSse';

const COPY = {
  customer: {
    ASSIGNED: 'Your courier is collecting your order. The live map appears once it is picked up.',
    PICKED_UP: 'Your courier is on the way.',
    DELIVERED: 'Delivered.',
    FAILED: "We couldn't reach you — we'll try again soon.",
  },
  vendor: {
    ASSIGNED: 'A Yobou courier is on the way to collect this order. Have it packed and ready.',
    PICKED_UP: 'Collected by the courier. The live position is now only shared with the customer.',
    DELIVERED: 'Delivered to the customer.',
    FAILED: 'Delivery attempt failed — the Yobou team will re-dispatch.',
  },
  admin: {
    ASSIGNED: 'Assigned — courier heading to pickup.',
    PICKED_UP: 'Out for delivery.',
    DELIVERED: 'Delivered.',
    FAILED: 'Delivery attempt failed — re-assign from the courier panel.',
  },
};

export default function LiveTracking({ orderId, title = 'Courier tracking' }) {
  const [t, setT] = useState(null);
  const [, tick] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await api(`/api/orders/${orderId}/tracking`);
      setT(r.tracking);
    } catch { /* keep last state */ }
  }, [orderId]);

  useEffect(() => {
    load();
    const poll = setInterval(load, 30000);
    const clock = setInterval(() => tick((n) => n + 1), 10000); // refresh "x s ago"
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [load]);

  const tRef = useRef(null);
  tRef.current = t;
  useCourierStream((frame) => {
    const cur = tRef.current;
    if (frame.orderId !== orderId || !cur) return;
    if (frame.status && frame.status !== cur.status) { load(); return; }
    const route = frame.location && (cur.audience === 'admin' || cur.status === 'PICKED_UP')
      ? [...cur.route, [frame.location.lat, frame.location.lng]]
      : cur.route;
    setT({ ...cur, location: frame.location, route });
  });

  // Status changes (pickup / delivered / failed) arrive as inbox notifications.
  useNotificationStream((note) => {
    if (note?.link && note.link.includes(orderId)) load();
  });

  const markers = useMemo(() => {
    if (!t) return [];
    const out = [];
    if (t.location) {
      out.push({
        id: 'courier',
        lat: t.location.lat,
        lng: t.location.lng,
        kind: t.location.stale ? 'stale' : 'courier',
        label: `${t.courier?.name || 'Courier'} · ${ago(t.location.at)}`,
      });
    }
    if (t.dropoff) out.push({ id: 'dropoff', ...t.dropoff, kind: 'dropoff', label: 'Delivered here' });
    return out;
  }, [t]);

  if (!t) return null;
  const copy = (COPY[t.audience] || COPY.customer)[t.status] || t.status;
  const showMap = markers.length > 0 || t.route.length > 1;
  const canCall = t.courier?.phone && ['ASSIGNED', 'PICKED_UP'].includes(t.status);

  return (
    <section className="card p-4 space-y-3">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
          <Icon name="two_wheeler" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-bold">{title}</div>
          <div className="text-sm text-on-surface-variant">
            {t.courier?.name ? `${t.courier.name} · ` : ''}{copy}
          </div>
        </div>
        {canCall && (
          <a href={`tel:${t.courier.phone}`} className="btn-secondary py-2 px-3" aria-label="Call courier">
            <Icon name="call" />
          </a>
        )}
      </div>

      {t.deliveryCode && (
        <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 flex items-center gap-3">
          <Icon name="password" className="text-primary text-[22px]" />
          <div className="flex-1 text-sm">
            {t.audience === 'customer'
              ? 'Give this code to the courier when your order arrives — never before.'
              : 'Customer hand-over code (for support only).'}
          </div>
          <div className="text-2xl font-black tracking-[0.3em] text-primary">{t.deliveryCode}</div>
        </div>
      )}

      {t.location && (
        <div className={`text-label-md flex items-center gap-1 ${t.location.stale ? 'text-error' : 'text-on-surface-variant'}`}>
          <span className={`inline-block w-2 h-2 rounded-full ${t.location.stale ? 'bg-error' : 'bg-tertiary animate-pulse'}`} />
          {t.location.stale ? `Signal lost — last seen ${ago(t.location.at)}` : `Live · updated ${ago(t.location.at)}`}
          {t.location.speed != null && !t.location.stale && ` · ${Math.round(t.location.speed * 3.6)} km/h`}
        </div>
      )}

      {showMap && <TrackingMap markers={markers} route={t.route} height={240} />}

      <ol className="grid grid-cols-3 gap-2 text-label-md">
        {[
          ['Assigned', t.assignedAt],
          ['Picked up', t.pickedUpAt],
          ['Delivered', t.deliveredAt],
        ].map(([label, at]) => (
          <li key={label} className={`rounded-md p-2 ${at ? 'bg-primary/10 text-primary' : 'bg-surface-low text-on-surface-variant'}`}>
            <div className="font-semibold">{label}</div>
            <div>{at ? new Date(at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}</div>
          </li>
        ))}
      </ol>
      {t.attempts > 0 && t.failReason && (
        <div className="text-label-md text-error">{t.attempts} failed attempt(s) · {t.failReason}</div>
      )}

      {t.rating && (
        <div className="text-sm flex items-center gap-2">
          <Stars value={t.rating.stars} />
          {t.rating.comment && <span className="text-on-surface-variant">“{t.rating.comment}”</span>}
        </div>
      )}
      {t.canRate && <RateCourier orderId={orderId} name={t.courier?.name} onDone={load} />}
    </section>
  );
}

function Stars({ value, onPick }) {
  return (
    <span className="inline-flex">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={!onPick}
          onClick={() => onPick?.(n)}
          aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={`material-symbols-outlined text-[24px] ${n <= value ? 'text-secondary' : 'text-outline-variant'} ${onPick ? 'cursor-pointer' : 'cursor-default'}`}
          style={{ fontVariationSettings: n <= value ? "'FILL' 1" : "'FILL' 0" }}
        >
          star
        </button>
      ))}
    </span>
  );
}

function RateCourier({ orderId, name, onDone }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function submit() {
    setBusy(true); setErr('');
    try {
      await api(`/api/orders/${orderId}/rate-courier`, { method: 'POST', body: { rating: stars, comment: comment.trim() || undefined } });
      onDone();
    } catch {
      setErr('Could not send your rating.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg bg-surface-low p-3 space-y-2">
      <div className="font-semibold text-sm">How was your delivery{name ? ` with ${name}` : ''}?</div>
      <Stars value={stars} onPick={setStars} />
      {stars > 0 && (
        <>
          <input className="input" placeholder="Add a comment (optional)" maxLength={500} value={comment} onChange={(e) => setComment(e.target.value)} />
          <button onClick={submit} disabled={busy} className="btn-primary w-full disabled:opacity-60">Send rating</button>
        </>
      )}
      {err && <div className="text-error text-label-md">{err}</div>}
    </div>
  );
}
