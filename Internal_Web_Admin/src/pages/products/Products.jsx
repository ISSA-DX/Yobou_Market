import StatusBadge from '../../components/StatusBadge';
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getAccessToken, refreshAccessToken } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { useProductLiveSync } from '../../lib/useProductLiveSync';
import { shopperHomeUrl } from '../../lib/config';
import { parseCsv } from '../../lib/csv';
import { SURFACES, pinsFromProduct, pinLabel } from '../../lib/placement';

const STATUS_STYLES = {
  LIVE: 'bg-tertiary-container/20 text-tertiary border-0',
  DRAFT: 'bg-secondary/20 text-secondary border-0',
  HIDDEN: 'bg-error/10 text-error border-0',
};

const API_BASE = import.meta.env.VITE_API_BASE || '';
const EMPTY_FILTERS = { q: '', status: '', vendor: '', stock: '' };

// Bulk actions — each collects its value in BulkModal before running.
const BULK_ACTIONS = {
  setStatus: { label: 'Change status', icon: 'visibility' },
  assignVendor: { label: 'Move to store', icon: 'storefront' },
  setDepartment: { label: 'Move to department', icon: 'category' },
  pin: { label: 'Pin to page', icon: 'push_pin' },
  setPlacement: { label: 'Storefront sections', icon: 'dashboard_customize' },
  adjustPrice: { label: 'Adjust price %', icon: 'percent' },
  setStock: { label: 'Set stock', icon: 'inventory' },
  delete: { label: 'Delete', icon: 'delete' },
};

export default function Products() {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState(() => new Set());
  const [bulk, setBulk] = useState(null); // { action, value }
  const [busy, setBusy] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const fileRef = useRef(null);

  // Memoize the API path so the string identity is stable across renders
  // (otherwise useApi's useCallback re-creates `run` every time and the
  // useEffect chain refetches in a tight loop, surfacing as React error
  // #321 "Maximum update depth exceeded" on the deployed admin).
  const query = useMemo(() => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v) qs.set(k, v); });
    return qs.toString();
  }, [filters]);
  const apiPath = useMemo(() => `/api/admin/products${query ? `?${query}` : ''}`, [query]);
  const { data, error, loading, refetch } = useApi(apiPath);
  const vendorsApi = useApi('/api/admin/vendors');
  const vendors = vendorsApi.data?.vendors || [];
  const [actionErr, setActionErr] = useState('');
  const [actionOk, setActionOk] = useState('');
  // Live sync — refetch when anyone (this admin tab included, or a vendor's
  // approval) creates/updates/deletes any product.
  useProductLiveSync(refetch);

  const products = data?.products || [];
  const allChecked = products.length > 0 && products.every((p) => selected.has(p.id));

  function setFilter(k, v) {
    setFilters((f) => ({ ...f, [k]: v }));
    setSelected(new Set());
  }

  function toggle(id) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allChecked ? new Set() : new Set(products.map((p) => p.id)));
  }

  function flash(ok, msg) {
    setActionOk(ok ? msg : '');
    setActionErr(ok ? '' : msg);
  }

  async function remove(p) {
    const ok = window.confirm(`Delete “${p.name}”? This cannot be undone.`);
    if (!ok) return;
    try {
      await api(`/api/products/${p.id}`, { method: 'DELETE' });
      flash(true, `“${p.name}” deleted.`);
      refetch();
    } catch (e) {
      const msg = e.data?.error;
      if (msg === 'PRODUCT_HAS_ORDERS') {
        flash(false, `“${p.name}” has existing orders and cannot be deleted. Set status to HIDDEN instead.`);
      } else {
        flash(false, e.data?.error || e.message || 'Could not delete product.');
      }
    }
  }

  async function runBulk() {
    const { action, value } = bulk;
    const body = { action, ids: [...selected] };
    if (action === 'adjustPrice') body.value = Number(value);
    else if (action === 'setStock') body.value = Math.max(0, Math.floor(Number(value)));
    else if (action === 'assignVendor') body.value = value === 'direct' ? null : value;
    else if (action === 'setDepartment' || action === 'pin') body.value = { ...value, subcategory: value.subcategory || null };
    else if (action !== 'delete') body.value = value;
    setBusy(true);
    try {
      const r = await api('/api/admin/products/bulk', { method: 'POST', body });
      const parts = [];
      if (r.updated) parts.push(`${r.updated} updated`);
      if (r.deleted) parts.push(`${r.deleted} deleted`);
      if (r.hidden) parts.push(`${r.hidden} hidden (have order history)`);
      if (r.skipped?.length) parts.push(`${r.skipped.length} skipped`);
      flash(true, parts.join(' · ') || 'Nothing changed.');
      setSelected(new Set());
      refetch();
    } catch (e) {
      flash(false, e.data?.error || 'Bulk action failed.');
    } finally {
      setBulk(null);
      setBusy(false);
    }
  }

  async function exportCsv() {
    const url = `${API_BASE}/api/admin/products/export${query ? `?${query}` : ''}`;
    const get = () => fetch(url, { credentials: 'include', headers: { Authorization: `Bearer ${getAccessToken()}` } });
    try {
      let res = await get();
      if (res.status === 401 && await refreshAccessToken()) res = await get();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'yobou-products.csv';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } catch {
      flash(false, 'Export failed. Try again.');
    }
  }

  async function importCsv(file) {
    if (!file) return;
    setBusy(true);
    try {
      const rows = parseCsv(await file.text());
      if (rows.length === 0) throw new Error('EMPTY');
      const r = await api('/api/admin/products/import', { method: 'POST', body: { rows } });
      setImportResult({ ...r, fileName: file.name });
      refetch();
    } catch (e) {
      flash(false, e.message === 'EMPTY' ? 'That file has no product rows.' : (e.data?.error || 'Import failed.'));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  if (error && !data) {
    return <RetryError message="Couldn't load products." onRetry={refetch} />;
  }

  const filtered = Object.values(filters).some(Boolean);

  return (
    <div className="space-y-5">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <h1 className="text-headline-lg font-bold">All products</h1>
          <p className="text-on-surface-variant text-sm">
            The full catalogue across every store. Admin changes go live immediately; partner edits arrive in Changes for approval.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a
            href={shopperHomeUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary"
            title="Open the customer storefront in a new tab"
          >
            <Icon name="open_in_new" />
            Storefront
          </a>
          <button onClick={exportCsv} className="btn-secondary" title="Download the current view as CSV">
            <Icon name="download" /> Export CSV
          </button>
          <button onClick={() => fileRef.current?.click()} disabled={busy} className="btn-secondary" title="Create or update products from a CSV">
            <Icon name="upload" /> Import CSV
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => importCsv(e.target.files?.[0])} />
          <Link to="/products/new" className="btn-primary">
            <Icon name="add" /> Add product
          </Link>
        </div>
      </div>

      {actionErr && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[20px] shrink-0" />
          <span>{actionErr}</span>
        </div>
      )}

      {actionOk && (
        <div className="card p-4 bg-tertiary-container/20 text-tertiary text-sm flex items-center gap-2">
          <Icon name="check_circle" className="text-[20px]" />
          <span>{actionOk}</span>
        </div>
      )}

      <div className="card p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
          <input
            className="input pl-10"
            placeholder="Search name, category, description or ID"
            value={filters.q}
            onChange={(e) => setFilter('q', e.target.value)}
          />
        </div>
        <select className="input w-auto" value={filters.vendor} onChange={(e) => setFilter('vendor', e.target.value)}>
          <option value="">All stores</option>
          <option value="direct">Yobou Direct</option>
          {vendors.map((v) => <option key={v.vendorId} value={v.vendorId}>{v.businessName}</option>)}
        </select>
        <select className="input w-auto" value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
          <option value="">Any status</option>
          <option value="LIVE">Live</option>
          <option value="DRAFT">Draft</option>
          <option value="HIDDEN">Hidden</option>
        </select>
        <select className="input w-auto" value={filters.stock} onChange={(e) => setFilter('stock', e.target.value)}>
          <option value="">Any stock</option>
          <option value="low">Low (1–5)</option>
          <option value="out">Out of stock</option>
        </select>
        {filtered && (
          <button onClick={() => { setFilters(EMPTY_FILTERS); setSelected(new Set()); }} className="btn-secondary py-2 px-3">Clear</button>
        )}
      </div>

      {selected.size > 0 && (
        <div className="card p-3 flex flex-wrap items-center gap-2 border border-primary/30 sticky top-2 z-10">
          <span className="font-semibold text-sm mr-2">{selected.size} selected</span>
          {Object.entries(BULK_ACTIONS).map(([key, a]) => (
            <button
              key={key}
              onClick={() => setBulk({
                action: key,
                value: key === 'setStatus' ? 'HIDDEN'
                  : key === 'assignVendor' ? 'direct'
                    : key === 'setPlacement' ? { flag: 'showOnNewArrivals', on: true }
                      : key === 'setDepartment' ? { category: '', subcategory: '' }
                        : key === 'pin' ? { category: '', subcategory: '', on: true }
                          : '',
              })}
              className={`btn-secondary py-1.5 px-3 text-sm ${key === 'delete' ? 'text-error' : ''}`}
            >
              <Icon name={a.icon} className="text-[18px]" /> {a.label}
            </button>
          ))}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-sm text-on-surface-variant hover:underline">Clear selection</button>
        </div>
      )}

      <div className="text-label-md text-on-surface-variant">
        {loading && !data ? 'Loading…' : `${products.length} product${products.length === 1 ? '' : 's'}`}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3 w-10">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Store</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">
                  <Icon name="progress_activity" className="text-[24px] animate-spin inline-block" />
                  <span className="ml-2">Loading products…</span>
                </td>
              </tr>
            )}

            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-on-surface-variant">
                  {filtered ? 'No products match these filters.' : 'No products yet.'}
                </td>
              </tr>
            )}

            {products.map((p) => (
              <tr key={p.id} className={`border-t border-outline-variant/20 ${selected.has(p.id) ? 'bg-primary/5' : ''}`}>
                <td className="px-4 py-3">
                  <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label={`Select ${p.name}`} />
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={productImage(p)}
                      alt=""
                      className="w-12 h-12 rounded-md object-cover bg-surface-low"
                      onError={(e) => { e.currentTarget.src = `${import.meta.env.BASE_URL}seed-images/placeholder.svg`; }}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold line-clamp-1">{p.name}</div>
                      <div className="text-label-md text-on-surface-variant line-clamp-1">
                        {p.id.slice(-8).toUpperCase()}
                        {p.orderCount > 0 && ` · ${p.orderCount} sold`}
                        {p.variantCount > 0 && ` · ${p.variantCount} variants`}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-on-surface-variant">
                  {p.category}{p.subcategory && <div className="text-label-sm">{p.subcategory}</div>}
                  <PlacementBadges product={p} />
                </td>
                <td className="px-4 py-3">
                  <div className="font-semibold">${(p.priceCents / 100).toFixed(2)}</div>
                  {p.compareAtPriceCents != null && (
                    <div className="text-label-md text-on-surface-variant line-through">${(p.compareAtPriceCents / 100).toFixed(2)}</div>
                  )}
                </td>
                <td className={`px-4 py-3 ${p.stock === 0 ? 'text-error font-semibold' : p.stock <= 5 ? 'text-secondary font-semibold' : ''}`}>{p.stock}</td>
                <td className="px-4 py-3 text-on-surface-variant">{p.vendor?.businessName || 'Yobou Direct'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 items-start">
                    <StatusBadge status={p.status} />
                    {p.pendingChanges?.length > 0 && (
                      <Link
                        to="/changes"
                        className="chip bg-secondary/20 text-secondary flex items-center gap-1"
                        title="View pending change requests"
                      >
                        <Icon name="pending_actions" className="text-[14px]" />
                        {p.pendingChanges.length} pending
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      to={`/products/${p.id}/edit`}
                      className="p-2 rounded-md hover:bg-surface-low text-on-surface-variant"
                      title="Edit"
                    >
                      <Icon name="edit" className="text-[20px]" />
                    </Link>
                    <button
                      onClick={() => remove(p)}
                      className="p-2 rounded-md hover:bg-error/10 text-error"
                      title="Delete"
                    >
                      <Icon name="delete" className="text-[20px]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <BulkModal bulk={bulk} setBulk={setBulk} count={selected.size} vendors={vendors} busy={busy} onRun={runBulk} />

      <Modal
        open={Boolean(importResult)}
        onClose={() => setImportResult(null)}
        title="Import finished"
        footer={<button onClick={() => setImportResult(null)} className="btn-primary">Done</button>}
      >
        {importResult && (
          <div className="space-y-3 text-sm">
            <div className="text-on-surface-variant">{importResult.fileName}</div>
            <div className="flex gap-4">
              <div><span className="font-bold text-lg">{importResult.created}</span> created</div>
              <div><span className="font-bold text-lg">{importResult.updated}</span> updated</div>
              <div className={importResult.errors.length ? 'text-error' : ''}>
                <span className="font-bold text-lg">{importResult.errors.length}</span> errors
              </div>
            </div>
            {importResult.errors.length > 0 && (
              <ul className="max-h-60 overflow-y-auto space-y-1 bg-error/5 rounded-md p-3">
                {importResult.errors.map((e, i) => (
                  <li key={i}><span className="font-semibold">Line {e.line}:</span> {e.message}</li>
                ))}
              </ul>
            )}
            <p className="text-label-md text-on-surface-variant">
              Tip: export first to get the exact columns. Rows with an <code>id</code> update that product; rows without one create a new product
              (name, category and priceCents required). Prices are in cents; separate image URLs with <code>|</code>.
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}

function BulkModal({ bulk, setBulk, count, vendors, busy, onRun }) {
  if (!bulk) return null;
  const meta = BULK_ACTIONS[bulk.action];
  const set = (value) => setBulk({ ...bulk, value });
  const needsValue = bulk.action !== 'delete';
  const needsCategory = bulk.action === 'setDepartment' || bulk.action === 'pin';
  const valid = (!needsCategory || Boolean(bulk.value?.category)) && (!needsValue || (bulk.value !== '' && bulk.value != null
    && (bulk.action !== 'adjustPrice' || (Number(bulk.value) >= -90 && Number(bulk.value) <= 500))
    && (bulk.action !== 'setStock' || Number(bulk.value) >= 0)));

  return (
    <Modal
      open
      onClose={() => setBulk(null)}
      title={`${meta.label} · ${count} product${count === 1 ? '' : 's'}`}
      footer={(
        <>
          <button onClick={() => setBulk(null)} className="btn-secondary">Cancel</button>
          <button
            onClick={onRun}
            disabled={!valid || busy}
            className={`${bulk.action === 'delete' ? 'btn-danger' : 'btn-primary'} disabled:opacity-60`}
          >
            {busy ? 'Working…' : 'Apply'}
          </button>
        </>
      )}
    >
      <div className="space-y-3 text-sm">
        {bulk.action === 'setStatus' && (
          <select className="input" value={bulk.value} onChange={(e) => set(e.target.value)}>
            <option value="LIVE">Live — visible on the storefront</option>
            <option value="DRAFT">Draft</option>
            <option value="HIDDEN">Hidden</option>
          </select>
        )}
        {bulk.action === 'assignVendor' && (
          <>
            <select className="input" value={bulk.value} onChange={(e) => set(e.target.value)}>
              <option value="direct">Yobou Direct (admin-owned)</option>
              {vendors.map((v) => <option key={v.vendorId} value={v.vendorId}>{v.businessName}</option>)}
            </select>
            <p className="text-on-surface-variant">From now on the products appear only in that store&apos;s partner dashboard.</p>
          </>
        )}
        {bulk.action === 'setPlacement' && (
          <>
            <label className="block">
              <span className="label">Section</span>
              <select className="input" value={bulk.value.flag} onChange={(e) => set({ ...bulk.value, flag: e.target.value })}>
                {SURFACES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <span className="block text-label-sm text-on-surface-variant mt-1">{SURFACES.find((s) => s.key === bulk.value.flag)?.helper}</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[[true, 'Add to section'], [false, 'Remove from section']].map(([on, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => set({ ...bulk.value, on })}
                  className={bulk.value.on === on ? 'btn-primary' : 'btn-secondary'}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="text-on-surface-variant">Applies immediately on the storefront.</p>
          </>
        )}
        {(bulk.action === 'setDepartment' || bulk.action === 'pin') && (
          <DepartmentPicker value={bulk.value} onChange={set} allowWhole />
        )}
        {bulk.action === 'setDepartment' && (
          <p className="text-on-surface-variant">Sets each product’s main category page. Pinned pages are kept.</p>
        )}
        {bulk.action === 'pin' && (
          <>
            <div className="grid grid-cols-2 gap-2">
              {[[true, 'Pin to this page'], [false, 'Unpin from category']].map(([on, label]) => (
                <button key={label} type="button" onClick={() => set({ ...bulk.value, on })} className={bulk.value.on === on ? 'btn-primary' : 'btn-secondary'}>
                  {label}
                </button>
              ))}
            </div>
            <p className="text-on-surface-variant">Pinned products also appear on that category or department page. Up to 10 pins per product; existing pins are kept.</p>
          </>
        )}
        {bulk.action === 'adjustPrice' && (
          <>
            <input className="input" type="number" min={-90} max={500} step="0.5" placeholder="e.g. -10 for 10% off" value={bulk.value} onChange={(e) => set(e.target.value)} />
            <p className="text-on-surface-variant">Negative lowers prices, positive raises them. Deals whose list price is no longer higher are removed.</p>
          </>
        )}
        {bulk.action === 'setStock' && (
          <>
            <input className="input" type="number" min={0} step="1" value={bulk.value} onChange={(e) => set(e.target.value)} />
            <p className="text-on-surface-variant">Products with colour/size variants are skipped — edit their stock per variant.</p>
          </>
        )}
        {bulk.action === 'delete' && (
          <p>
            Permanently delete the selected products? Products that already appear in customer orders will be
            <strong> hidden</strong> instead, so order history stays intact.
          </p>
        )}
      </div>
    </Modal>
  );
}

// Compact "where it shows" chips under the category: pins + the curated
// surfaces that are switched on (default-on Home/Search are implied).
function PlacementBadges({ product }) {
  const pins = pinsFromProduct(product);
  const curated = SURFACES.filter((s) => !s.default && product[s.key]);
  const hasDeal = product.compareAtPriceCents != null && product.compareAtPriceCents > product.priceCents;
  // Default-on surfaces switched off. New arrivals ages out naturally and
  // Deals only matters for products that have a deal price.
  const hiddenDefaults = SURFACES.filter((s) => s.default && product[s.key] === false
    && s.key !== 'showOnNewArrivals' && (s.key !== 'showOnDeals' || hasDeal));
  if (pins.length === 0 && curated.length === 0 && hiddenDefaults.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1 max-w-[220px]">
      {curated.map((s) => (
        <span key={s.key} title={s.label} className="inline-flex items-center gap-0.5 rounded-full bg-primary/10 text-primary px-1.5 py-0.5 text-[10px] font-semibold">
          <Icon name={s.icon} className="text-[11px]" />{s.short}
        </span>
      ))}
      {pins.map((pin) => (
        <span key={pin.name} title={`Pinned to ${pinLabel(pin)}`} className="inline-flex items-center gap-0.5 rounded-full bg-secondary/20 text-on-secondary px-1.5 py-0.5 text-[10px] font-semibold">
          <Icon name="push_pin" className="text-[11px]" />{pinLabel(pin)}
        </span>
      ))}
      {hiddenDefaults.length > 0 && (
        <span title={hiddenDefaults.map((s) => s.label).join(', ')} className="inline-flex items-center gap-0.5 rounded-full bg-surface-high text-on-surface-variant px-1.5 py-0.5 text-[10px] font-semibold">
          <Icon name="visibility_off" className="text-[11px]" />Not on: {hiddenDefaults.map((s) => s.short).join(', ')}
        </span>
      )}
    </div>
  );
}

// Category + optional department chooser for the bulk tool.
function DepartmentPicker({ value, onChange, allowWhole }) {
  const { data } = useApi('/api/categories');
  const cats = (data?.categories || []).filter((c) => c.isActive !== false && c.source !== 'live');
  const subs = (cats.find((c) => c.name === value.category)?.subcategories || []).filter((s) => s.isActive !== false);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
      <label className="block">
        <span className="label">Category</span>
        <select className="input" value={value.category} onChange={(e) => onChange({ ...value, category: e.target.value, subcategory: '' })}>
          <option value="">Choose…</option>
          {cats.map((c) => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
        </select>
      </label>
      <label className="block">
        <span className="label">Department</span>
        <select className="input" value={value.subcategory} onChange={(e) => onChange({ ...value, subcategory: e.target.value })} disabled={!value.category || subs.length === 0}>
          <option value="">{allowWhole ? 'Whole category' : 'None'}</option>
          {subs.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
        </select>
      </label>
    </div>
  );
}
