// Courier app — what a Yobou delivery driver (role=DRIVER) sees after
// signing in to the Partner app. Mobile-first, one screen:
//   - today's stats (delivered, cash collected)
//   - Active jobs: Picked up → Delivered / Couldn't deliver
//   - Completed jobs history
// Jobs are assigned by admins from the admin Deliveries board.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import { useApi, RetryError } from '../../useApi.jsx';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import StatusBadge from '../../components/StatusBadge';
import TrackingMap, { ago } from '../../components/TrackingMap';
import { toast } from '../../lib/toast';
import { formatPrice } from '../../lib/format';
import { useCourierGps } from '../../lib/useCourierGps';

const STATUS = {
  ASSIGNED: { label: 'Ready for pickup', cls: 'bg-secondary/20 text-secondary' },
  PICKED_UP: { label: 'Out for delivery', cls: 'bg-primary/10 text-primary' },
  DELIVERED: { label: 'Delivered', cls: 'bg-tertiary-container/20 text-tertiary' },
  FAILED: { label: 'Not delivered', cls: 'bg-error/10 text-error' },
};

const shortId = (id) => `#${id.slice(-6).toUpperCase()}`;

function mapsUrl(a) {
  const q = [a.line1, a.city, a.state, a.postal].filter(Boolean).join(', ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

export default function Courier() {
  const user = useStore((s) => s.user);
  const navigate = useNavigate();
  const currency = user?.currency || 'USD';
  const [scope, setScope] = useState('active');
  const path = useMemo(() => `/api/driver/deliveries?scope=${scope}`, [scope]);
  const { data, error, loading, refetch } = useApi(path);
  const [deliverJob, setDeliverJob] = useState(null);
  const [failJob, setFailJob] = useState(null);
  const [busyId, setBusyId] = useState(null);
  // On duty = GPS is shared. Initial value comes from the server so the
  // toggle survives app restarts.
  const [onDuty, setOnDuty] = useState(false);
  const [dutyBusy, setDutyBusy] = useState(false);
  const { position, gpsError, lastSentAt } = useCourierGps(onDuty);
  const [, tick] = useState(0);

  useEffect(() => {
    if (data && typeof data.onDuty === 'boolean') setOnDuty(data.onDuty);
    // Only sync from the first response; afterwards the toggle is authoritative.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(data)]);

  // New assignments arrive from the admin board — poll while open.
  useEffect(() => {
    const t = setInterval(refetch, 30000);
    const clock = setInterval(() => tick((n) => n + 1), 10000);
    return () => { clearInterval(t); clearInterval(clock); };
  }, [refetch]);

  async function toggleDuty() {
    const next = !onDuty;
    setDutyBusy(true);
    try {
      await api('/api/driver/duty', { method: 'POST', body: { onDuty: next } });
      setOnDuty(next);
      toast.info(next ? 'You are on duty — sharing your location.' : 'Off duty — location sharing stopped.');
    } catch {
      toast.error('Could not change duty status.');
    } finally {
      setDutyBusy(false);
    }
  }

  async function pickup(job) {
    setBusyId(job.id);
    try {
      await api(`/api/driver/deliveries/${job.id}/pickup`, { method: 'POST' });
      toast.success(`Order ${shortId(job.order.id)} picked up`);
      refetch();
    } catch (e) {
      toast.error(e.data?.error === 'ORDER_ALREADY_FINAL' ? 'This order was cancelled.' : 'Could not update the job.');
    } finally {
      setBusyId(null);
    }
  }

  if (error && !data) return <RetryError message="Couldn't load your deliveries." onRetry={refetch} />;
  const jobs = data?.deliveries || [];
  const stats = data?.stats;

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-10 bg-white/90 dark:bg-transparent backdrop-blur border-b border-outline-variant/30">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary text-white flex items-center justify-center">
            <Icon name="two_wheeler" className="text-[20px]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-bold leading-tight">Yobou Courier</div>
            <div className="text-label-md text-on-surface-variant truncate">{user?.name}</div>
          </div>
          <button onClick={refetch} className="p-2 rounded-md hover:bg-surface-low" aria-label="Refresh">
            <Icon name="refresh" className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => navigate('/logout')} className="p-2 rounded-md hover:bg-surface-low" aria-label="Sign out">
            <Icon name="logout" />
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-4 space-y-4">
        <section className="card p-4 space-y-3">
          <div className="flex items-center gap-3">
            <span className={`w-3 h-3 rounded-full ${onDuty ? (gpsError ? 'bg-error' : 'bg-tertiary animate-pulse') : 'bg-outline-variant'}`} />
            <div className="flex-1 min-w-0">
              <div className="font-bold">{onDuty ? 'On duty' : 'Off duty'}</div>
              <div className="text-label-md text-on-surface-variant">
                {!onDuty && 'Go on duty to receive jobs and share your live location.'}
                {onDuty && gpsError}
                {onDuty && !gpsError && !position && 'Getting your GPS position…'}
                {onDuty && !gpsError && position && (
                  <>Sharing location{position.accuracy ? ` (±${Math.round(position.accuracy)} m)` : ''}{lastSentAt ? ` · sent ${ago(lastSentAt)}` : ''}</>
                )}
              </div>
            </div>
            <button
              onClick={toggleDuty}
              disabled={dutyBusy}
              role="switch"
              aria-checked={onDuty}
              className={`relative w-14 h-8 rounded-full transition-colors disabled:opacity-60 ${onDuty ? 'bg-primary' : 'bg-outline-variant'}`}
            >
              <span className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-all ${onDuty ? 'left-7' : 'left-1'}`} />
            </button>
          </div>
          {onDuty && position && (
            <TrackingMap
              height={200}
              markers={[{ id: 'me', lat: position.lat, lng: position.lng, kind: 'courier', label: 'You' }]}
            />
          )}
        </section>

        {stats && (
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-4">
              <div className="text-label-md text-on-surface-variant">Delivered today</div>
              <div className="text-headline-lg font-bold">{stats.deliveredToday}</div>
            </div>
            <div className="card p-4">
              <div className="text-label-md text-on-surface-variant">Cash collected today</div>
              <div className="text-headline-lg font-bold">{formatPrice(stats.codCollectedTodayCents, currency)}</div>
            </div>
            <div className={`card p-4 ${stats.cashToHandInCents > 0 ? 'bg-secondary/10' : ''}`}>
              <div className="text-label-md text-on-surface-variant">Cash to hand in to Yobou</div>
              <div className="text-headline-lg font-bold">{formatPrice(stats.cashToHandInCents || 0, currency)}</div>
            </div>
            <div className="card p-4">
              <div className="text-label-md text-on-surface-variant">Your rating</div>
              <div className="text-headline-lg font-bold flex items-center gap-1">
                {stats.avgRating != null ? stats.avgRating.toFixed(1) : '—'}
                <Icon name="star" className="text-secondary text-[22px]" />
                <span className="text-label-md text-on-surface-variant font-normal">({stats.ratingCount || 0})</span>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          {[['active', 'My jobs'], ['done', 'Completed']].map(([k, label]) => (
            <button key={k} onClick={() => setScope(k)} className={`flex-1 ${scope === k ? 'btn-primary' : 'btn-secondary'}`}>
              {label}
            </button>
          ))}
        </div>

        {loading && !data && <div className="text-center text-on-surface-variant py-8">Loading…</div>}
        {!loading && jobs.length === 0 && (
          <div className="card p-8 text-center text-on-surface-variant">
            <Icon name="inventory_2" className="text-[40px]" />
            <div className="mt-2">{scope === 'active' ? 'No deliveries assigned right now.' : 'No completed deliveries yet.'}</div>
          </div>
        )}

        {jobs.map((job) => {
          const st = STATUS[job.status] || { label: job.status, cls: '' };
          const a = job.order.address;
          const pickups = [...new Set(job.order.items.map((i) => i.pickupFrom))];
          return (
            <article key={job.id} className="card p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <div className="font-bold">Order {shortId(job.order.id)}</div>
                  <div className="text-label-md text-on-surface-variant">
                    {job.order.items.reduce((s, i) => s + i.quantity, 0)} item(s) · assigned {new Date(job.assignedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
                <StatusBadge status={job.status} label={st.label} />
              </div>

              {/* Route: stop 1 pickup → stop 2 drop-off */}
              <ol className="relative space-y-4">
                <span className="absolute left-[15px] top-8 bottom-8 w-0.5 border-l-2 border-dashed border-outline-variant" aria-hidden="true" />
                <li className="relative flex gap-3 text-sm">
                  <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    job.status === 'ASSIGNED' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'
                  }`}
                  >
                    <Icon name={job.status === 'ASSIGNED' ? 'storefront' : 'check'} className="text-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="eyebrow">Pick up</div>
                    <div className="font-semibold">{pickups.join(', ')}</div>
                    <ul className="mt-1 space-y-0.5 text-on-surface-variant">
                      {job.order.items.map((i) => (
                        <li key={i.id}><span className="font-semibold text-on-surface">{i.quantity}×</span> {i.name}</li>
                      ))}
                    </ul>
                  </div>
                </li>
                <li className="relative flex gap-3 text-sm">
                  <div className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
                    job.status === 'DELIVERED' ? 'bg-emerald-500 text-white' : job.status === 'PICKED_UP' ? 'bg-primary text-white' : 'bg-surface-high text-on-surface-variant'
                  }`}
                  >
                    <Icon name={job.status === 'DELIVERED' ? 'check' : 'location_on'} className="text-[18px]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="eyebrow">Drop off</div>
                    <div className="font-semibold">{job.order.customerName || 'Customer'}</div>
                    <div className="text-on-surface-variant">{a.line1}, {a.city} {a.state} {a.postal}</div>
                    <a href={mapsUrl(a)} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-primary font-semibold text-label-md">
                      <Icon name="directions" className="text-[16px]" /> Directions
                    </a>
                  </div>
                </li>
              </ol>

              <div className={`rounded-md p-3 text-sm flex items-center gap-2 ${job.codAmountCents > 0 ? 'bg-amber-50 text-amber-900' : 'bg-surface-low text-on-surface-variant'}`}>
                <Icon name={job.codAmountCents > 0 ? 'payments' : 'credit_score'} className="text-[20px]" />
                {job.codAmountCents > 0
                  ? <span>Collect <strong className="text-base">{formatPrice(job.codAmountCents, currency)}</strong> in cash</span>
                  : <span className="font-semibold">Prepaid — nothing to collect</span>}
              </div>

              {job.status === 'FAILED' && job.failReason && (
                <div className="text-sm text-error">Reason: {job.failReason}</div>
              )}
              {job.status === 'DELIVERED' && (
                <div className="text-label-md text-on-surface-variant">
                  {job.recipientName ? `Received by ${job.recipientName} · ` : ''}
                  {job.deliveredAt && new Date(job.deliveredAt).toLocaleString()}
                </div>
              )}

              {job.status === 'ASSIGNED' && (
                <button onClick={() => pickup(job)} disabled={busyId === job.id} className="btn-primary w-full py-3 disabled:opacity-60">
                  <Icon name="inventory" /> I&apos;ve picked up the items
                </button>
              )}
              {job.status === 'PICKED_UP' && (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setFailJob(job)} className="btn-secondary py-3 text-error">
                    <Icon name="report" /> Couldn&apos;t deliver
                  </button>
                  <button onClick={() => setDeliverJob(job)} className="btn-primary py-3">
                    <Icon name="check_circle" /> Delivered
                  </button>
                </div>
              )}
            </article>
          );
        })}
      </main>

      <DeliverModal job={deliverJob} currency={currency} position={position} onClose={() => setDeliverJob(null)} onDone={() => { setDeliverJob(null); refetch(); }} />
      <FailModal job={failJob} onClose={() => setFailJob(null)} onDone={() => { setFailJob(null); refetch(); }} />
    </div>
  );
}

function DeliverModal({ job, currency, position, onClose, onDone }) {
  const [recipientName, setRecipientName] = useState('');
  const [proofNote, setProofNote] = useState('');
  const [cash, setCash] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    setRecipientName(job?.order.customerName || '');
    setProofNote('');
    setCode('');
    setCash(job?.codAmountCents ? String(job.codAmountCents / 100) : '');
    setErr('');
  }, [job]);

  if (!job) return null;
  const cod = job.codAmountCents > 0;

  async function submit() {
    setBusy(true); setErr('');
    try {
      const body = { code: code.trim(), recipientName: recipientName.trim() || undefined, proofNote: proofNote.trim() || undefined };
      if (cod) body.codCollectedCents = Math.round(Number(cash) * 100);
      // Proof of delivery: where the hand-over happened.
      if (position) { body.lat = position.lat; body.lng = position.lng; }
      await api(`/api/driver/deliveries/${job.id}/deliver`, { method: 'POST', body });
      toast.success('Delivery completed');
      onDone();
    } catch (e) {
      const codeErr = e.data?.error;
      setErr(codeErr === 'INVALID_DELIVERY_CODE'
        ? 'Wrong delivery code. Ask the customer for the 4-digit code shown in their Yobou app.'
        : codeErr === 'COD_AMOUNT_SHORT'
          ? `Collect the full ${formatPrice(job.codAmountCents, currency)} before completing.`
          : 'Could not complete the delivery.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Deliver ${shortId(job.order.id)}`}
      footer={(
        <>
          <button onClick={onClose} className="btn-secondary">Back</button>
          <button onClick={submit} disabled={busy || code.trim().length !== 4} className="btn-primary disabled:opacity-60">Confirm delivery</button>
        </>
      )}
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Customer&apos;s delivery code</span>
          <input
            className="input mt-1 text-center text-2xl tracking-[0.5em] font-bold"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={4}
            placeholder="••••"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
        </label>
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Received by</span>
          <input className="input mt-1" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} />
        </label>
        {cod && (
          <label className="block">
            <span className="text-label-md text-on-surface-variant">Cash collected (due {formatPrice(job.codAmountCents, currency)})</span>
            <input className="input mt-1" type="number" inputMode="decimal" min="0" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} />
          </label>
        )}
        <label className="block">
          <span className="text-label-md text-on-surface-variant">Note (optional)</span>
          <input className="input mt-1" placeholder="e.g. Left with the guard" value={proofNote} onChange={(e) => setProofNote(e.target.value)} />
        </label>
        {err && <div className="text-error">{err}</div>}
      </div>
    </Modal>
  );
}

const FAIL_REASONS = ['Customer not home', 'Customer unreachable by phone', 'Wrong address', 'Customer refused the order'];

function FailModal({ job, onClose, onDone }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason(''); }, [job]);
  if (!job) return null;

  async function submit() {
    setBusy(true);
    try {
      await api(`/api/driver/deliveries/${job.id}/fail`, { method: 'POST', body: { reason } });
      toast.info('Reported — the Yobou team will reschedule.');
      onDone();
    } catch {
      toast.error('Could not report the attempt.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Couldn't deliver"
      footer={(
        <>
          <button onClick={onClose} className="btn-secondary">Back</button>
          <button onClick={submit} disabled={busy || reason.trim().length < 3} className="btn-danger disabled:opacity-60">Report</button>
        </>
      )}
    >
      <div className="space-y-2 text-sm">
        {FAIL_REASONS.map((r) => (
          <label key={r} className="flex items-center gap-2">
            <input type="radio" name="fail-reason" checked={reason === r} onChange={() => setReason(r)} /> {r}
          </label>
        ))}
        <input className="input" placeholder="Other reason" value={FAIL_REASONS.includes(reason) ? '' : reason} onChange={(e) => setReason(e.target.value)} />
        <p className="text-label-md text-on-surface-variant">Keep the items safe — an admin will re-assign the delivery.</p>
      </div>
    </Modal>
  );
}
