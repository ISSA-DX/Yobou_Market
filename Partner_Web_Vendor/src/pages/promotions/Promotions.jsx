// Partner Promotions — request a banner on a category or department page
// for your store or one of your products. Requests are reviewed by Yobou
// (Admin → Campaigns); you get an inbox message when one is decided.
// Server: routes/merch.js (vendor router).
import { useState } from 'react';
import { api } from '../../api';
import Icon from '../../components/Icon';
import ImageField, { assetUrl } from '../../components/ImageField';
import { useApi, RetryError } from '../../useApi.jsx';
import { toast } from '../../lib/toast';
import { useStore } from '../../store';

const STATE = {
  PENDING: { label: 'Waiting for review', cls: 'bg-secondary/20 text-secondary', icon: 'hourglass_top' },
  LIVE: { label: 'Live', cls: 'bg-tertiary-container/20 text-tertiary', icon: 'check_circle' },
  SCHEDULED: { label: 'Approved · starts later', cls: 'bg-primary/10 text-primary', icon: 'event' },
  PAUSED: { label: 'Paused by Yobou', cls: 'bg-surface-high text-on-surface-variant', icon: 'pause_circle' },
  ENDED: { label: 'Ended', cls: 'bg-surface-high text-on-surface-variant', icon: 'history' },
  REJECTED: { label: 'Not approved', cls: 'bg-error/10 text-error', icon: 'cancel' },
};
const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null);
const EMPTY = { title: '', subtitle: '', ctaLabel: 'Shop now', imageUrl: '', category: '', subcategory: '', target: 'store', productId: '', startsAt: '', endsAt: '' };

export default function Promotions() {
  const storeName = useStore((s) => s.user?.vendor?.businessName) || 'Your store';
  const { data, error, refetch } = useApi('/api/vendor/campaigns');
  const cats = useApi('/api/categories');
  const mine = useApi('/api/products/vendor/mine?status=LIVE');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const categories = (cats.data?.categories || []).filter((c) => c.source !== 'live' && c.isActive !== false);
  const subs = (categories.find((c) => c.name === form.category)?.subcategories || []).filter((s) => s.isActive !== false);
  const products = (mine.data?.products || []).filter((p) => !form.category || p.category === form.category);
  const campaigns = data?.campaigns || [];
  const valid = form.title.trim() && form.category && (form.target === 'store' || form.productId);

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setErr('');
    try {
      await api('/api/vendor/campaigns', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          subtitle: form.subtitle.trim() || null,
          ctaLabel: form.ctaLabel.trim() || 'Shop now',
          imageUrl: form.imageUrl || null,
          category: form.category,
          subcategory: form.subcategory || null,
          target: form.target,
          ...(form.target === 'product' ? { productId: form.productId } : {}),
          startsAt: form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null,
          endsAt: form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null,
        },
      });
      toast.success('Banner request sent — Yobou will review it shortly.');
      setForm(EMPTY);
      refetch();
    } catch (ex) {
      setErr(ex?.data?.message || ex?.data?.error || 'Could not send the request.');
    } finally { setBusy(false); }
  }

  async function withdraw(c) {
    if (!window.confirm(`Withdraw “${c.title}”?`)) return;
    try { await api(`/api/vendor/campaigns/${c.id}`, { method: 'DELETE' }); refetch(); } catch { toast.error('Could not withdraw.'); }
  }

  if (error && !data) return <RetryError message="Couldn't load your promotions." onRetry={refetch} />;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-headline-lg font-bold">Promotions</h1>
        <p className="text-on-surface-variant text-sm">
          Feature your store or a product in a banner at the top of a category page. Yobou reviews every request before it goes live.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-5 items-start">
        <form onSubmit={submit} className="card p-5 space-y-4">
          <h2 className="text-title-lg font-semibold">Request a banner</h2>

          <Preview form={form} storeName={storeName} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Category page">
              <select className="input" value={form.category} onChange={(e) => { set('category', e.target.value); set('subcategory', ''); set('productId', ''); }}>
                <option value="">Choose…</option>
                {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </Field>
            <Field label="Department (optional)">
              <select className="input" value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)} disabled={!form.category}>
                <option value="">Whole category</option>
                {subs.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Headline">
            <input className="input" maxLength={80} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="e.g. New season serums — free delivery in Bamako" />
          </Field>
          <Field label="Subtitle (optional)">
            <input className="input" maxLength={160} value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} />
          </Field>

          <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
            <Field label="Button text">
              <input className="input" maxLength={30} value={form.ctaLabel} onChange={(e) => set('ctaLabel', e.target.value)} />
            </Field>
            <Field label="Button opens">
              <div className="grid grid-cols-2 gap-2">
                {[['store', 'My store page', 'storefront'], ['product', 'One of my products', 'inventory_2']].map(([t, label, icon]) => (
                  <button key={t} type="button" onClick={() => set('target', t)} className={form.target === t ? 'btn-primary' : 'btn-secondary'}>
                    <Icon name={icon} /> {label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          {form.target === 'product' && (
            <Field label="Product" hint={form.category ? `Your live products in ${form.category}.` : 'Choose a category first.'}>
              <select className="input" value={form.productId} onChange={(e) => set('productId', e.target.value)} disabled={!form.category}>
                <option value="">Choose…</option>
                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </Field>
          )}

          <Field label="Image (optional)">
            <ImageField value={form.imageUrl} onChange={(v) => set('imageUrl', v)} hint="A product photo on a plain background works best." />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Start"><input type="date" className="input" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
            <Field label="End"><input type="date" className="input" value={form.endsAt} min={form.startsAt || undefined} onChange={(e) => set('endsAt', e.target.value)} /></Field>
          </div>

          {err && <div role="alert" className="text-error text-sm">{err}</div>}
          <button type="submit" className="btn-primary w-full" disabled={!valid || busy}>
            <Icon name="send" /> {busy ? 'Sending…' : 'Send for review'}
          </button>
        </form>

        <section className="card p-5 space-y-3" aria-labelledby="my-banners-h">
          <h2 id="my-banners-h" className="text-title-lg font-semibold">My banner requests</h2>
          {campaigns.length === 0 && <p className="text-sm text-on-surface-variant">No requests yet.</p>}
          <ul className="space-y-3">
            {campaigns.map((c) => {
              const st = STATE[c.state] || STATE.PENDING;
              return (
                <li key={c.id} className="border border-outline-variant/40 rounded-xl p-3 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className={`chip border-0 ${st.cls}`}><Icon name={st.icon} className="text-[14px]" /> {st.label}</span>
                    {c.status === 'PENDING' && <button type="button" onClick={() => withdraw(c)} className="text-label-md text-error hover:underline">Withdraw</button>}
                  </div>
                  <div className="font-semibold text-sm">{c.title}</div>
                  <div className="text-label-sm text-on-surface-variant">
                    {c.subcategory ? `${c.category} › ${c.subcategory}` : c.category} · {day(c.startsAt) || 'Now'} → {day(c.endsAt) || 'open-ended'}
                  </div>
                  {c.reviewNote && <div className="text-label-sm text-on-surface-variant">Yobou: {c.reviewNote}</div>}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Preview({ form, storeName }) {
  return (
    <div className="relative flex min-h-[124px] overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-container text-white">
      <div className="flex-1 p-4 min-w-0">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          <Icon name="storefront" className="text-[12px]" /> {storeName}
        </span>
        <div className="mt-2 font-bold text-lg leading-tight line-clamp-2">{form.title || 'Your headline here'}</div>
        {form.subtitle && <div className="text-sm text-white/85 line-clamp-2">{form.subtitle}</div>}
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white text-primary px-3 py-1 text-xs font-bold">
          {form.ctaLabel || 'Shop now'} <Icon name="arrow_forward" className="text-[14px]" />
        </span>
      </div>
      {form.imageUrl && <img src={assetUrl(form.imageUrl)} alt="" className="w-[38%] object-cover" />}
    </div>
  );
}

// Div, not <label>: some fields hold several controls.
function Field({ label, hint, children }) {
  return (
    <div>
      <span className="text-label-md text-on-surface-variant">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-label-sm text-on-surface-variant mt-1">{hint}</span>}
    </div>
  );
}
