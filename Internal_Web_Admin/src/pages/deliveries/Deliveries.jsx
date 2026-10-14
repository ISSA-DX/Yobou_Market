// Admin dispatch board — last-mile delivery by Yobou couriers.
//
// Tabs:
//   - Dispatch queue: paid / COD / failed-attempt orders with no active courier.
//     Pick a courier per row and assign.
//   - Live & history: every delivery job, filterable by status.
//   - Couriers: courier accounts with workload, plus "Add courier".
//
// Couriers sign in to the Yobou Partner app and land on /courier.
import StatusBadge from '../../components/StatusBadge';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import TrackingMap, { ago } from '../../components/TrackingMap';
import { useApi, RetryError } from '../../useApi.jsx';
import { useCourierStream } from '../../lib/useSse';

const TABS = [
  { key: 'map', label: 'Live map', icon: 'map' },
  { key: 'queue', label: 'Dispatch queue', icon: 'pending_actions' },
  { key: 'jobs', label: 'Live & history', icon: 'two_wheeler' },
  { key: 'drivers', label: 'Couriers', icon: 'badge' },
];

const DELIVERY_STYLES = {
  ASSIGNED: 'bg-secondary/20 text-secondary',
  PICKED_UP: 'bg-primary/10 text-primary',
  DELIVERED: 'bg-tertiary-container/20 text-tertiary',
  FAILED: 'bg-error/10 text-error',
};
const DELIVERY_LABEL = { ASSIGNED: 'Assigned', PICKED_UP: 'Out for delivery', DELIVERED: 'Delivered', FAILED: 'Failed' };

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;
const shortId = (id) => `#${id.slice(-6).toUpperCase()}`;
const place = (o) => [o.snapshotLine1, o.snapshotCity].filter(Boolean).join(', ') || '—';

export default function Deliveries() {
  const [tab, setTab] = useState('queue');
  const driversApi = useApi('/api/admin/drivers');
  const drivers = driversApi.data?.drivers || [];
  const activeDrivers = drivers.filter((d) => !d.disabledAt);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-headline-lg font-bold">Deliveries</h1>
        <p className="text-on-surface-variant text-sm">
          Dispatch orders to Yobou couriers and follow every delivery to the customer&apos;s door.
        </p>
      </div>

      <div className="flex gap-2 flex-wrap">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={tab === t.key ? 'btn-primary py-2' : 'btn-secondary py-2'}
          >
            <Icon name={t.icon} className="text-[18px]" /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'map' && <Fleet />}
      {tab === 'queue' && <Queue drivers={activeDrivers} onAssigned={driversApi.refetch} />}
      {tab === 'jobs' && <Jobs drivers={drivers} />}
      {tab === 'drivers' && <Drivers api={driversApi} />}
    </div>
  );
}

// Fleet map — every on-duty courier, live over SSE (`event: courier`).
function Fleet() {
  const { data, error, refetch } = useApi('/api/admin/fleet');
  const [couriers, setCouriers] = useState(null);
  const couriersRef = useRef(null);
  couriersRef.current = couriers;
  const [focus, setFocus] = useState(null);
  const [, tick] = useState(0);

  useEffect(() => { if (data) setCouriers(data.couriers); }, [data]);
  useEffect(() => {
    const poll = setInterval(refetch, 30000);
    const clock = setInterval(() => tick((n) => n + 1), 10000);
    return () => { clearInterval(poll); clearInterval(clock); };
  }, [refetch]);

  useCourierStream((frame) => {
    if (frame.audience !== 'admin' || !frame.driverId) return;
    const cur = couriersRef.current;
    if (!cur) return;
    const known = cur.find((c) => c.driverId === frame.driverId);
    // New courier or a changed job list → reload addresses from the server.
    const jobsChanged = frame.activeDeliveries && known && (
      frame.activeDeliveries.length !== known.activeDeliveries.length
      || frame.activeDeliveries.some((f) => known.activeDeliveries.find((a) => a.id === f.id)?.status !== f.status)
    );
    if (!known || jobsChanged) refetch();
    if (known) {
      setCouriers(cur.map((c) => (c.driverId === frame.driverId ? { ...c, onDuty: frame.onDuty, location: frame.location } : c)));
    }
  });

  const list = couriers || [];
  const onDuty = list.filter((c) => c.onDuty);
  const visible = focus ? onDuty.filter((c) => c.driverId === focus) : onDuty;
  const markers = useMemo(() => visible
    .filter((c) => c.location)
    .map((c) => ({
      id: c.driverId,
      lat: c.location.lat,
      lng: c.location.lng,
      kind: c.location.stale ? 'stale' : 'courier',
      label: `${c.name} · ${c.activeDeliveries.length} job(s) · ${ago(c.location.at)}`,
    })), [visible]);

  if (error && !data) return <RetryError message="Couldn't load the fleet." onRetry={refetch} />;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 card p-2">
        <TrackingMap markers={markers} height={480} follow={Boolean(focus)} />
        {onDuty.length === 0 && (
          <div className="p-3 text-sm text-on-surface-variant">
            No courier is on duty. Couriers go on duty from the courier screen in the Partner app, which shares their GPS.
          </div>
        )}
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="font-semibold">{onDuty.length} on duty · {list.length - onDuty.length} off</span>
          {focus && <button onClick={() => setFocus(null)} className="text-primary font-semibold">Show all</button>}
        </div>
        {list.map((c) => (
          <button
            key={c.driverId}
            onClick={() => c.location && setFocus(c.driverId)}
            className={`card p-3 w-full text-left ${focus === c.driverId ? 'border border-primary' : ''}`}
          >
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${!c.onDuty ? 'bg-outline-variant' : c.location?.stale || !c.location ? 'bg-error' : 'bg-tertiary'}`} />
              <span className="font-semibold flex-1">{c.name}</span>
              <span className="text-label-md text-on-surface-variant">
                {!c.onDuty ? 'Off duty' : !c.location ? 'No GPS yet' : c.location.stale ? `Signal lost ${ago(c.location.at)}` : ago(c.location.at)}
              </span>
            </div>
            {c.activeDeliveries.length > 0 && (
              <ul className="mt-2 space-y-1 text-label-md">
                {c.activeDeliveries.map((d) => (
                  <li key={d.id} className="flex justify-between gap-2">
                    <Link to={`/orders/${d.orderId}/track`} onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">
                      {shortId(d.orderId)}
                    </Link>
                    <span className="text-on-surface-variant truncate">{DELIVERY_LABEL[d.status]}{d.order ? ` · ${place(d.order)}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

function Queue({ drivers, onAssigned }) {
  const { data, error, loading, refetch } = useApi('/api/admin/deliveries/queue');
  const [pick, setPick] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [msg, setMsg] = useState(null);

  async function assign(order) {
    const driverId = pick[order.id];
    if (!driverId) return;
    setBusyId(order.id); setMsg(null);
    try {
      await api(`/api/admin/orders/${order.id}/assign-driver`, { method: 'POST', body: { driverId } });
      const name = drivers.find((d) => d.id === driverId)?.name;
      setMsg({ ok: true, text: `Order ${shortId(order.id)} assigned to ${name}.` });
      refetch();
      onAssigned();
    } catch (e) {
      setMsg({ ok: false, text: e?.data?.error || 'Could not assign courier.' });
    } finally {
      setBusyId(null);
    }
  }

  if (error && !data) return <RetryError message="Couldn't load the dispatch queue." onRetry={refetch} />;
  const orders = data?.orders || [];

  return (
    <div className="space-y-3">
      {drivers.length === 0 && (
        <div className="card p-4 bg-secondary/10 text-sm flex items-center gap-2">
          <Icon name="info" className="text-[20px] text-secondary" />
          No active couriers yet — add one in the Couriers tab before dispatching.
        </div>
      )}
      {msg && (
        <div className={`card p-3 text-sm ${msg.ok ? 'bg-tertiary-container/20 text-tertiary' : 'bg-error/10 text-error'}`}>{msg.text}</div>
      )}
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Customer</th>
              <th className="px-4 py-3">Drop-off</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">Courier</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">Loading…</td></tr>
            )}
            {!loading && orders.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">Nothing waiting for dispatch. 🎉</td></tr>
            )}
            {orders.map((o) => (
              <tr key={o.id} className="border-t border-outline-variant/20 align-top">
                <td className="px-4 py-3">
                  <Link to={`/orders/${o.id}/track`} className="font-semibold text-primary hover:underline">{shortId(o.id)}</Link>
                  <div className="text-label-md text-on-surface-variant">{o._count.items} item(s) · {o.status}</div>
                  {o.delivery?.status === 'FAILED' && (
                    <div className="text-label-md text-error mt-1">Retry · {o.delivery.failReason}</div>
                  )}
                </td>
                <td className="px-4 py-3">{o.snapshotName || o.user?.name || '—'}</td>
                <td className="px-4 py-3 text-on-surface-variant">{place(o)}</td>
                <td className="px-4 py-3">
                  <div className="font-semibold">{money(o.totalCents)}</div>
                  <div className="text-label-md text-on-surface-variant">{o.paymentMethod === 'COD' ? 'Collect cash' : 'Prepaid'}</div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select
                      className="input py-1.5 min-w-[160px]"
                      value={pick[o.id] || ''}
                      onChange={(e) => setPick({ ...pick, [o.id]: e.target.value })}
                    >
                      <option value="">Choose…</option>
                      {drivers.map((d) => (
                        <option key={d.id} value={d.id}>{d.name} ({d.activeDeliveries})</option>
                      ))}
                    </select>
                    <button
                      onClick={() => assign(o)}
                      disabled={!pick[o.id] || busyId === o.id}
                      className="btn-primary py-1.5 px-3 disabled:opacity-60"
                    >
                      Assign
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Jobs({ drivers }) {
  const [status, setStatus] = useState('');
  const [driverId, setDriverId] = useState('');
  const path = useMemo(() => {
    const qs = new URLSearchParams();
    if (status) qs.set('status', status);
    if (driverId) qs.set('driverId', driverId);
    const s = qs.toString();
    return `/api/admin/deliveries${s ? `?${s}` : ''}`;
  }, [status, driverId]);
  const { data, error, loading, refetch } = useApi(path);
  if (error && !data) return <RetryError message="Couldn't load deliveries." onRetry={refetch} />;
  const rows = data?.deliveries || [];

  return (
    <div className="space-y-3">
      <div className="card p-3 flex flex-wrap gap-2 items-center">
        <select className="input py-1.5 w-auto" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(DELIVERY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="input py-1.5 w-auto" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
          <option value="">All couriers</option>
          {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={refetch} className="btn-secondary py-1.5"><Icon name="refresh" className="text-[18px]" /> Refresh</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Order</th>
              <th className="px-4 py-3">Courier</th>
              <th className="px-4 py-3">Drop-off</th>
              <th className="px-4 py-3">Cash</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Updated</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">Loading…</td></tr>
            )}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">No deliveries match.</td></tr>
            )}
            {rows.map((d) => (
              <tr key={d.id} className="border-t border-outline-variant/20 align-top">
                <td className="px-4 py-3">
                  <Link to={`/orders/${d.order.id}/track`} className="font-semibold text-primary hover:underline">{shortId(d.order.id)}</Link>
                  <div className="text-label-md text-on-surface-variant">{d.order.snapshotName || d.order.user?.name}</div>
                </td>
                <td className="px-4 py-3">
                  {d.driver?.name || '—'}
                  {d.driver?.phone && <div className="text-label-md text-on-surface-variant">{d.driver.phone}</div>}
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{place(d.order)}</td>
                <td className="px-4 py-3">
                  {d.codAmountCents > 0
                    ? <>{money(d.codAmountCents)}{d.codCollectedCents != null && <div className="text-label-md text-tertiary">collected</div>}</>
                    : <span className="text-on-surface-variant">Prepaid</span>}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={d.status} />
                  {d.failReason && d.status === 'FAILED' && <div className="text-label-md text-error mt-1">{d.failReason}</div>}
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{new Date(d.updatedAt).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EMPTY_DRIVER = { name: '', email: '', phone: '', password: '' };

function Drivers({ api: driversApi }) {
  const { data, error, loading, refetch } = driversApi;
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_DRIVER);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function create(e) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      await api('/api/admin/drivers', { method: 'POST', body: form });
      setOpen(false);
      setForm(EMPTY_DRIVER);
      refetch();
    } catch (e2) {
      const code = e2?.data?.error;
      setErr(code === 'EMAIL_TAKEN' ? 'That email is already registered.'
        : code === 'INVALID_INPUT' ? 'Check the fields: password needs 8+ characters and phone 5+.'
        : 'Could not create courier.');
    } finally {
      setBusy(false);
    }
  }

  async function toggle(d) {
    const disable = !d.disabledAt;
    if (!window.confirm(`${disable ? 'Disable' : 'Re-enable'} courier ${d.name}?`)) return;
    try {
      await api(`/api/admin/users/${d.id}`, { method: 'PATCH', body: { disabled: disable } });
      refetch();
    } catch {
      window.alert('Could not update courier.');
    }
  }

  // Cash hand-in: the admin types the amount actually received; the server
  // rejects it unless it matches what the courier collected.
  async function settle(d) {
    const typed = window.prompt(
      `${d.name} is holding ${money(d.cashHeldCents)} in COD cash.\nEnter the amount you received to settle:`,
      (d.cashHeldCents / 100).toFixed(2),
    );
    if (typed === null) return;
    try {
      const r = await api(`/api/admin/drivers/${d.id}/settle-cash`, { method: 'POST', body: { amountCents: Math.round(Number(typed) * 100) } });
      window.alert(`Settled ${money(r.settledCents)} for ${r.deliveries} delivery(ies).`);
      refetch();
    } catch (e) {
      window.alert(e?.data?.error === 'AMOUNT_MISMATCH'
        ? `Amount does not match: ${d.name} should hand in ${money(e.data.heldCents)}.`
        : 'Could not settle cash.');
    }
  }

  if (error && !data) return <RetryError message="Couldn't load couriers." onRetry={refetch} />;
  const drivers = data?.drivers || [];

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center gap-2 flex-wrap">
        <p className="text-sm text-on-surface-variant">
          Couriers sign in to the <strong>Yobou Partner</strong> app with these credentials.
        </p>
        <button onClick={() => setOpen(true)} className="btn-primary"><Icon name="person_add" /> Add courier</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Courier</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Active jobs</th>
              <th className="px-4 py-3">Delivered</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Cash held</th>
              <th className="px-4 py-3 text-right">Account</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">Loading…</td></tr>
            )}
            {!loading && drivers.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">No couriers yet.</td></tr>
            )}
            {drivers.map((d) => (
              <tr key={d.id} className="border-t border-outline-variant/20">
                <td className="px-4 py-3">
                  <div className="font-semibold">{d.name}</div>
                  <div className="text-label-md text-on-surface-variant">{d.email}</div>
                </td>
                <td className="px-4 py-3">{d.phone || '—'}</td>
                <td className="px-4 py-3">{d.activeDeliveries}</td>
                <td className="px-4 py-3">{d.completedDeliveries}</td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {d.avgRating != null
                    ? <>{d.avgRating.toFixed(1)} <Icon name="star" className="text-[16px] text-secondary align-text-bottom" /> <span className="text-on-surface-variant">({d.ratingCount})</span></>
                    : <span className="text-on-surface-variant">—</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  {d.cashHeldCents > 0 ? (
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-secondary">{money(d.cashHeldCents)}</span>
                      <button onClick={() => settle(d)} className="btn-secondary py-1 px-2 text-label-md">Settle</button>
                    </div>
                  ) : <span className="text-on-surface-variant">—</span>}
                </td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => toggle(d)} className={`text-sm font-semibold ${d.disabledAt ? 'text-primary' : 'text-error'}`}>
                    {d.disabledAt ? 'Re-enable' : 'Disable'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add courier"
        footer={(
          <>
            <button type="button" onClick={() => setOpen(false)} className="btn-secondary">Cancel</button>
            <button type="submit" form="driver-form" disabled={busy} className="btn-primary disabled:opacity-60">Create courier</button>
          </>
        )}
      >
        <form id="driver-form" onSubmit={create} className="space-y-3">
          {[
            ['name', 'Full name', 'text'],
            ['email', 'Email (login)', 'email'],
            ['phone', 'Phone', 'tel'],
            ['password', 'Temporary password', 'text'],
          ].map(([k, label, type]) => (
            <label key={k} className="block">
              <span className="text-label-md text-on-surface-variant">{label}</span>
              <input
                className="input mt-1"
                type={type}
                required
                minLength={k === 'password' ? 8 : undefined}
                value={form[k]}
                onChange={(e) => setForm({ ...form, [k]: e.target.value })}
              />
            </label>
          ))}
          {err && <div className="text-error text-sm">{err}</div>}
        </form>
      </Modal>
    </div>
  );
}
