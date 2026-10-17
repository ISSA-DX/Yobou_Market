// Admin Campaigns — promotional banners on category / department pages.
//
// Admin banners go live immediately (within their dates). Partners request
// banners for their own store or products from the partner portal; those
// arrive here as PENDING for approval. Server: routes/merch.js.
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import ImageField, { assetUrl } from '../../components/ImageField';
import { useApi, RetryError } from '../../useApi.jsx';

const STATE_STYLE = {
  LIVE: 'bg-tertiary-container/20 text-tertiary',
  PENDING: 'bg-secondary/20 text-secondary',
  SCHEDULED: 'bg-primary/10 text-primary',
  PAUSED: 'bg-surface-high text-on-surface-variant',
  ENDED: 'bg-surface-high text-on-surface-variant',
  REJECTED: 'bg-error/10 text-error',
};
const FILTERS = ['ALL', 'PENDING', 'LIVE', 'SCHEDULED', 'PAUSED', 'ENDED', 'REJECTED'];

const day = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null);
const toInputDate = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '');
const errMsg = (e, f) => e?.data?.message || e?.data?.error || f;

export default function Campaigns() {
  const [params, setParams] = useSearchParams();
  const filter = FILTERS.includes(params.get('status')) ? params.get('status') : 'ALL';
  const { data, error, loading, refetch } = useApi('/api/admin/campaigns');
  const [editing, setEditing] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState('');

  const campaigns = data?.campaigns || [];
  const shown = useMemo(() => campaigns.filter((c) => filter === 'ALL' || c.state === filter || (filter === 'PENDING' && c.status === 'PENDING')), [campaigns, filter]);
  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f, f === 'ALL' ? campaigns.length : campaigns.filter((c) => c.state === f).length])), [campaigns]);

  async function patch(c, body, okText) {
    setBusy(c.id); setMsg('');
    try {
      await api(`/api/admin/campaigns/${c.id}`, { method: 'PATCH', body });
      setMsg(okText);
      refetch();
    } catch (e) {
      setMsg(errMsg(e, 'Could not update the banner.'));
    } finally { setBusy(null); }
  }

  async function reject(c) {
    const note = window.prompt('Reason for the partner (optional):', '');
    if (note === null) return;
    await patch(c, { status: 'REJECTED', reviewNote: note || null }, 'Request rejected — the partner has been notified.');
  }

  async function remove(c) {
    if (!window.confirm(`Delete the banner “${c.title}”?`)) return;
    setBusy(c.id);
    try { await api(`/api/admin/campaigns/${c.id}`, { method: 'DELETE' }); refetch(); } catch (e) { setMsg(errMsg(e, 'Could not delete.')); } finally { setBusy(null); }
  }

  if (error && !data) return <RetryError message="Couldn't load campaigns." onRetry={refetch} />;

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-headline-lg font-bold">Campaigns</h1>
          <p className="text-on-surface-variant text-sm">
            Banners at the top of category and department pages. Partners request banners for their own products; you approve them here.
          </p>
        </div>
        <button className="btn-primary" onClick={() => setEditing({})}><Icon name="add" /> New banner</button>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setParams(f === 'ALL' ? {} : { status: f })}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border ${filter === f ? 'bg-primary text-white border-primary' : 'bg-white border-outline-variant/60'}`}
          >
            {f === 'ALL' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
            <span className={`ml-1.5 ${filter === f ? 'text-white/80' : 'text-on-surface-variant'}`}>{counts[f] || 0}</span>
          </button>
        ))}
      </div>

      {msg && <div className="card p-3 text-sm" role="status">{msg}</div>}
      {loading && !data && <div className="card p-6 text-on-surface-variant">Loading…</div>}
      {!loading && shown.length === 0 && (
        <div className="card p-10 text-center text-on-surface-variant">
          <Icon name="view_carousel" className="text-[36px]" />
          <p className="mt-2">{filter === 'PENDING' ? 'No partner requests waiting.' : 'No banners here yet.'}</p>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {shown.map((c) => (
          <article key={c.id} className="card overflow-hidden">
            <BannerPreview c={c} />
            <div className="p-4 space-y-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`chip border-0 ${STATE_STYLE[c.state] || ''}`}>{c.state.toLowerCase()}</span>
                <span className="text-sm font-medium">{c.subcategory ? `${c.category} › ${c.subcategory}` : c.category}</span>
                {c.vendor && <span className="text-label-md text-on-surface-variant">· requested by {c.vendor.businessName}</span>}
              </div>
              <div className="text-label-md text-on-surface-variant flex flex-wrap gap-x-3 gap-y-1">
                <span><Icon name="link" className="text-[14px] align-[-2px]" /> {c.linkUrl}</span>
                <span><Icon name="event" className="text-[14px] align-[-2px]" /> {day(c.startsAt) || 'Now'} → {day(c.endsAt) || 'no end date'}</span>
              </div>
              {c.reviewNote && <p className="text-label-md text-on-surface-variant">Note: {c.reviewNote}</p>}
              <div className="flex flex-wrap gap-2">
                {c.status === 'PENDING' ? (
                  <>
                    <button className="btn-primary" disabled={busy === c.id} onClick={() => patch(c, { status: 'APPROVED' }, 'Approved — the partner has been notified.')}>
                      <Icon name="check" /> Approve
                    </button>
                    <button className="btn-secondary text-error" disabled={busy === c.id} onClick={() => reject(c)}><Icon name="close" /> Reject</button>
                  </>
                ) : c.status === 'APPROVED' && (
                  <button className="btn-secondary" disabled={busy === c.id} onClick={() => patch(c, { isActive: !c.isActive }, c.isActive ? 'Banner paused.' : 'Banner resumed.')}>
                    <Icon name={c.isActive ? 'pause' : 'play_arrow'} /> {c.isActive ? 'Pause' : 'Resume'}
                  </button>
                )}
                <button className="btn-secondary" onClick={() => setEditing(c)}><Icon name="edit" /> Edit</button>
                <button className="btn-secondary text-error" disabled={busy === c.id} onClick={() => remove(c)}><Icon name="delete" /> Delete</button>
              </div>
            </div>
          </article>
        ))}
      </div>

      {editing && (
        <CampaignEditor
          campaign={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refetch(); setMsg('Banner saved.'); }}
        />
      )}
    </div>
  );
}

// Matches the shopper banner closely enough to judge the copy and image.
export function BannerPreview({ c }) {
  return (
    <div className="relative flex min-h-[132px] bg-gradient-to-br from-primary to-primary-container text-white">
      <div className="relative z-10 flex-1 p-4 min-w-0">
        <span className="inline-flex items-center gap-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
          <Icon name="campaign" className="text-[12px]" /> {c.vendor?.businessName || 'Yobou'}
        </span>
        <h3 className="mt-2 font-bold text-lg leading-tight text-white line-clamp-2">{c.title || 'Banner headline'}</h3>
        {c.subtitle && <p className="text-sm text-white/85 line-clamp-2">{c.subtitle}</p>}
        <span className="mt-3 inline-flex items-center gap-1 rounded-full bg-white text-primary px-3 py-1 text-xs font-bold">
          {c.ctaLabel || 'Shop now'} <Icon name="arrow_forward" className="text-[14px]" />
        </span>
      </div>
      {c.imageUrl && <img src={assetUrl(c.imageUrl)} alt="" className="w-[40%] object-cover" />}
    </div>
  );
}

function CampaignEditor({ campaign, onClose, onSaved }) {
  const isNew = !campaign.id;
  const cats = useApi('/api/categories');
  const vendors = useApi('/api/admin/vendors');
  const [form, setForm] = useState(() => ({
    title: campaign.title || '',
    subtitle: campaign.subtitle || '',
    ctaLabel: campaign.ctaLabel || 'Shop now',
    imageUrl: campaign.imageUrl || '',
    category: campaign.category || '',
    subcategory: campaign.subcategory || '',
    linkType: campaign.linkUrl ? 'custom' : 'category',
    linkUrl: campaign.linkUrl || '',
    startsAt: toInputDate(campaign.startsAt),
    endsAt: toInputDate(campaign.endsAt),
    isActive: campaign.isActive !== false,
    sortOrder: campaign.sortOrder || 0,
  }));
  const [linkTarget, setLinkTarget] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const categories = (cats.data?.categories || []).filter((c) => c.source !== 'live' && c.isActive !== false);
  const cat = categories.find((c) => c.name === form.category);
  const subs = cat?.subcategories?.filter((s) => s.isActive !== false) || [];
  const collections = useApi(form.category ? `/api/admin/collections?category=${encodeURIComponent(form.category)}` : '', { skip: !form.category });
  const productSearch = useApi(
    form.linkType === 'product' && form.category ? `/api/products?category=${encodeURIComponent(form.category)}&pageSize=40${linkTarget ? `&q=${encodeURIComponent(linkTarget)}` : ''}` : '',
    { skip: form.linkType !== 'product' || !form.category },
  );

  // Derive the link from the chosen target type.
  useEffect(() => {
    if (form.linkType === 'category' && cat) {
      const sub = subs.find((s) => s.name === form.subcategory);
      set('linkUrl', `/categories/${cat.slug}${sub ? `/${sub.slug}` : ''}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.linkType, form.category, form.subcategory, cats.data]);

  async function save() {
    setSaving(true); setErr('');
    const startIso = form.startsAt ? new Date(`${form.startsAt}T00:00:00`).toISOString() : null;
    const endIso = form.endsAt ? new Date(`${form.endsAt}T23:59:59`).toISOString() : null;
    const body = {
      title: form.title.trim(),
      subtitle: form.subtitle.trim() || null,
      ctaLabel: form.ctaLabel.trim() || 'Shop now',
      imageUrl: form.imageUrl || null,
      category: form.category,
      subcategory: form.subcategory || null,
      linkUrl: form.linkUrl,
      startsAt: startIso,
      endsAt: endIso,
      isActive: form.isActive,
      sortOrder: Number(form.sortOrder) || 0,
    };
    try {
      if (isNew) await api('/api/admin/campaigns', { method: 'POST', body });
      else await api(`/api/admin/campaigns/${campaign.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e) {
      setErr(errMsg(e, 'Could not save the banner.'));
    } finally { setSaving(false); }
  }

  const valid = form.title.trim() && form.category && form.linkUrl.startsWith('/');

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={isNew ? 'New banner' : `Edit “${campaign.title}”`}
      footer={(
        <>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={!valid || saving}>{saving ? 'Saving…' : 'Save banner'}</button>
        </>
      )}
    >
      <div className="space-y-4 text-sm">
        <BannerPreview c={{ ...form, vendor: campaign.vendor }} />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Show on category">
            <select className="input" value={form.category} onChange={(e) => { set('category', e.target.value); set('subcategory', ''); }}>
              <option value="">Choose…</option>
              {categories.map((c) => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="Department">
            <select className="input" value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)} disabled={!form.category}>
              <option value="">Whole category (all departments)</option>
              {subs.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
            </select>
          </Field>
        </div>

        <Field label="Headline" hint={`${form.title.length}/80`}>
          <input className="input" value={form.title} maxLength={80} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Glow week — up to 30% off serums" />
        </Field>
        <Field label="Subtitle (optional)">
          <input className="input" value={form.subtitle} maxLength={160} onChange={(e) => set('subtitle', e.target.value)} />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr] gap-3">
          <Field label="Button text">
            <input className="input" value={form.ctaLabel} maxLength={30} onChange={(e) => set('ctaLabel', e.target.value)} />
          </Field>
          <Field label="Button opens">
            <select className="input" value={form.linkType} onChange={(e) => { set('linkType', e.target.value); setLinkTarget(''); }}>
              <option value="category">This category / department page</option>
              <option value="collection">A collection</option>
              <option value="store">A partner store</option>
              <option value="product">A product</option>
              <option value="custom">Custom app page</option>
            </select>
          </Field>
        </div>

        {form.linkType === 'collection' && (
          <Field label="Collection">
            <select className="input" onChange={(e) => set('linkUrl', e.target.value ? `/collections/${e.target.value}` : '')} defaultValue="">
              <option value="">Choose…</option>
              {(collections.data?.collections || []).map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
            </select>
          </Field>
        )}
        {form.linkType === 'store' && (
          <Field label="Store">
            <select className="input" onChange={(e) => set('linkUrl', e.target.value ? `/stores/${e.target.value}` : '')} defaultValue="">
              <option value="">Choose…</option>
              {(vendors.data?.vendors || []).filter((v) => v.status === 'APPROVED' || !v.status).map((v) => (
                <option key={v.vendorId || v.id} value={v.vendorId || v.id}>{v.businessName}</option>
              ))}
            </select>
          </Field>
        )}
        {form.linkType === 'product' && (
          <Field label="Product" hint={form.category ? 'Products in the chosen category.' : 'Choose a category first.'}>
            <input className="input mb-2" placeholder="Search products…" value={linkTarget} onChange={(e) => setLinkTarget(e.target.value)} />
            <select className="input" onChange={(e) => set('linkUrl', e.target.value ? `/product/${e.target.value}` : '')} defaultValue="">
              <option value="">Choose…</option>
              {(productSearch.data?.products || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        )}
        <Field label="Link" hint="Banners can only open pages inside the app.">
          <input className="input font-mono text-xs" value={form.linkUrl} onChange={(e) => { set('linkType', 'custom'); set('linkUrl', e.target.value.trim()); }} placeholder="/categories/beauty" />
        </Field>

        <Field label="Image (optional)">
          <ImageField value={form.imageUrl} onChange={(v) => set('imageUrl', v)} hint="Shown on the right of the banner. Product photos on a plain background work best." />
        </Field>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Starts"><input type="date" className="input" value={form.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
          <Field label="Ends"><input type="date" className="input" value={form.endsAt} min={form.startsAt || undefined} onChange={(e) => set('endsAt', e.target.value)} /></Field>
          <Field label="Order"><input type="number" min="0" className="input" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} /></Field>
          <Field label="Status">
            <select className="input" value={form.isActive ? '1' : '0'} onChange={(e) => set('isActive', e.target.value === '1')}>
              <option value="1">Active</option>
              <option value="0">Paused</option>
            </select>
          </Field>
        </div>
        {err && <div role="alert" className="text-error">{err}</div>}
      </div>
    </Modal>
  );
}

// A div, not a <label>: several fields hold more than one control (image
// picker, search + select), and a wrapping label would forward clicks on
// the whole area to the first button.
function Field({ label, hint, children }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-label-sm text-on-surface-variant mt-1">{hint}</span>}
    </div>
  );
}
