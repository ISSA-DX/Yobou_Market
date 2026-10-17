// Collections for one category — curated rails on the shopper category
// page, each with its own /collections/:slug page. MANUAL = hand-picked
// products in order; RULE = live products matching price / discount /
// stock rules. Server: routes/merch.js.
import { useMemo, useState } from 'react';
import { api } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useApi } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { shopperHomeUrl } from '../../lib/config';

const errMsg = (e, f) => e?.data?.message || e?.data?.error || f;
const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;

export default function CollectionsSection({ category }) {
  const { data, refetch } = useApi(`/api/admin/collections?category=${encodeURIComponent(category.name)}`);
  const [editing, setEditing] = useState(null);
  const collections = data?.collections || [];

  async function toggle(c) {
    await api(`/api/admin/collections/${c.id}`, { method: 'PATCH', body: { isActive: !c.isActive } });
    refetch();
  }
  async function remove(c) {
    if (!window.confirm(`Delete the collection “${c.name}”?`)) return;
    await api(`/api/admin/collections/${c.id}`, { method: 'DELETE' });
    refetch();
  }

  return (
    <section className="card p-5 space-y-3" aria-labelledby="cat-coll-h">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2">
          <Icon name="collections_bookmark" className="text-[22px] text-primary mt-0.5" />
          <div>
            <h3 id="cat-coll-h" className="text-title-md font-semibold">Collections</h3>
            <p className="text-label-sm text-on-surface-variant">Curated rails on the {category.name} page, e.g. “Gifts under $25”. Each also gets its own page.</p>
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={() => setEditing({})}><Icon name="add" /> New collection</button>
      </div>

      {collections.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-3 text-center">No collections yet.</p>
      ) : (
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant/40 rounded-xl overflow-hidden">
          {collections.map((c) => (
            <li key={c.id} className={`flex items-center gap-3 px-3 py-2.5 ${c.isActive ? '' : 'bg-surface-low'}`}>
              <div className="flex -space-x-2 shrink-0">
                {(c.preview || []).slice(0, 3).map((p) => (
                  <img key={p.id} src={productImage(p)} alt="" className="w-9 h-9 rounded-lg object-cover ring-2 ring-white" />
                ))}
                {(!c.preview || c.preview.length === 0) && <span className="w-9 h-9 rounded-lg bg-surface-low flex items-center justify-center"><Icon name="inventory_2" className="text-[18px]" /></span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold truncate">{c.name} {!c.isActive && <span className="chip bg-surface-high text-on-surface-variant ml-1">Hidden</span>}</div>
                <div className="text-label-sm text-on-surface-variant truncate">
                  {c.mode === 'MANUAL' ? 'Hand-picked' : 'Automatic'} · {c.productCount} product{c.productCount === 1 ? '' : 's'}{c.subcategory ? ` · ${c.subcategory}` : ''}
                </div>
              </div>
              <a href={`${shopperHomeUrl()}collections/${c.slug}`} target="_blank" rel="noreferrer" className="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:bg-surface-low" title="View on storefront"><Icon name="open_in_new" className="text-[18px]" /></a>
              <button type="button" onClick={() => toggle(c)} className="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:bg-surface-low" title={c.isActive ? 'Hide' : 'Show'}><Icon name={c.isActive ? 'visibility' : 'visibility_off'} className="text-[18px]" /></button>
              <button type="button" onClick={() => setEditing(c)} className="w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:bg-surface-low" title="Edit"><Icon name="edit" className="text-[18px]" /></button>
              <button type="button" onClick={() => remove(c)} className="w-8 h-8 rounded-md flex items-center justify-center text-error hover:bg-error/10" title="Delete"><Icon name="delete" className="text-[18px]" /></button>
            </li>
          ))}
        </ul>
      )}

      {editing && <CollectionEditor category={category} collection={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refetch(); }} />}
    </section>
  );
}

function CollectionEditor({ category, collection, onClose, onSaved }) {
  const isNew = !collection.id;
  const [form, setForm] = useState({
    name: collection.name || '',
    description: collection.description || '',
    subcategory: collection.subcategory || '',
    mode: collection.mode || 'MANUAL',
    productIds: collection.productIds || [],
    maxPrice: collection.rule?.maxPriceCents ? String(collection.rule.maxPriceCents / 100) : '',
    minDiscountPct: collection.rule?.minDiscountPct ? String(collection.rule.minDiscountPct) : '',
    inStockOnly: collection.rule?.inStockOnly ?? true,
    sort: collection.rule?.sort || 'newest',
  });
  const [q, setQ] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  // All live products in this category (and pinned here), for picking and
  // for the live rule preview.
  const pool = useApi(`/api/products?${new URLSearchParams({ category: category.name, pageSize: '60', sort: 'newest' })}`);
  const products = pool.data?.products || [];
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const picked = form.productIds.map((id) => byId.get(id) || { id, name: '(not live)', missing: true });

  const rulePreview = useMemo(() => {
    let list = products.filter((p) => !form.subcategory || p.subcategory === form.subcategory);
    if (form.maxPrice) list = list.filter((p) => p.priceCents <= Math.round(Number(form.maxPrice) * 100));
    if (form.inStockOnly) list = list.filter((p) => p.stock > 0);
    if (form.minDiscountPct) list = list.filter((p) => p.compareAtPriceCents > p.priceCents && ((p.compareAtPriceCents - p.priceCents) / p.compareAtPriceCents) * 100 >= Number(form.minDiscountPct));
    return list;
  }, [products, form]);

  const candidates = products.filter((p) => !form.productIds.includes(p.id)
    && (!form.subcategory || p.subcategory === form.subcategory)
    && (!q.trim() || p.name.toLowerCase().includes(q.trim().toLowerCase())));

  const move = (i, d) => {
    const ids = [...form.productIds];
    const j = i + d;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    set('productIds', ids);
  };

  async function save() {
    setSaving(true); setErr('');
    const body = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: category.name,
      subcategory: form.subcategory || null,
      mode: form.mode,
      ...(form.mode === 'MANUAL'
        ? { productIds: form.productIds }
        : { rule: {
          maxPriceCents: form.maxPrice ? Math.round(Number(form.maxPrice) * 100) : null,
          minDiscountPct: form.minDiscountPct ? Number(form.minDiscountPct) : null,
          inStockOnly: form.inStockOnly,
          sort: form.sort,
        } }),
    };
    try {
      if (isNew) await api('/api/admin/collections', { method: 'POST', body });
      else await api(`/api/admin/collections/${collection.id}`, { method: 'PATCH', body });
      onSaved();
    } catch (e) {
      setErr(errMsg(e, 'Could not save the collection.'));
    } finally { setSaving(false); }
  }

  const subs = (category.subcategories || []).filter((s) => s.isActive !== false);
  const count = form.mode === 'MANUAL' ? form.productIds.length : rulePreview.length;

  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={isNew ? `New collection in ${category.name}` : `Edit “${collection.name}”`}
      footer={(
        <>
          <span className="mr-auto text-sm text-on-surface-variant">{count} product{count === 1 ? '' : 's'}</span>
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary" onClick={save} disabled={!form.name.trim() || count === 0 || saving}>{saving ? 'Saving…' : 'Save collection'}</button>
        </>
      )}
    >
      <div className="space-y-4 text-sm">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="block"><span className="label">Name</span>
            <input className="input mt-1" value={form.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Gifts under $25" />
          </label>
          <label className="block"><span className="label">Show on</span>
            <select className="input mt-1" value={form.subcategory} onChange={(e) => set('subcategory', e.target.value)}>
              <option value="">Whole {category.name} page</option>
              {subs.map((s) => <option key={s.id} value={s.name}>{s.name} page only</option>)}
            </select>
          </label>
        </div>
        <label className="block"><span className="label">Short description (optional)</span>
          <input className="input mt-1" value={form.description} maxLength={300} onChange={(e) => set('description', e.target.value)} />
        </label>

        <div className="grid grid-cols-2 gap-2">
          {[['MANUAL', 'Hand-pick products', 'touch_app'], ['RULE', 'Automatic by rules', 'auto_mode']].map(([m, label, icon]) => (
            <button key={m} type="button" onClick={() => set('mode', m)} className={form.mode === m ? 'btn-primary' : 'btn-secondary'}>
              <Icon name={icon} /> {label}
            </button>
          ))}
        </div>

        {form.mode === 'MANUAL' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <div className="label mb-1">In this collection — use the arrows to reorder</div>
              <ul className="border border-outline-variant/40 rounded-xl divide-y divide-outline-variant/30 max-h-72 overflow-y-auto">
                {picked.length === 0 && <li className="p-3 text-on-surface-variant">Pick products on the right.</li>}
                {picked.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-2 p-2">
                    <span className="w-6 text-center text-on-surface-variant">{i + 1}</span>
                    {!p.missing && <img src={productImage(p)} alt="" className="w-9 h-9 rounded object-cover" />}
                    <span className={`flex-1 truncate ${p.missing ? 'italic text-on-surface-variant' : ''}`}>{p.name}</span>
                    <button type="button" className="p-1" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up"><Icon name="arrow_upward" className="text-[16px]" /></button>
                    <button type="button" className="p-1" onClick={() => move(i, 1)} disabled={i === picked.length - 1} aria-label="Move down"><Icon name="arrow_downward" className="text-[16px]" /></button>
                    <button type="button" className="p-1 text-error" onClick={() => set('productIds', form.productIds.filter((x) => x !== p.id))} aria-label="Remove"><Icon name="close" className="text-[16px]" /></button>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <div className="label mb-1">Add products</div>
              <input className="input mb-2" placeholder="Search this category…" value={q} onChange={(e) => setQ(e.target.value)} />
              <ul className="border border-outline-variant/40 rounded-xl divide-y divide-outline-variant/30 max-h-60 overflow-y-auto">
                {candidates.slice(0, 40).map((p) => (
                  <li key={p.id}>
                    <button type="button" className="w-full flex items-center gap-2 p-2 text-left hover:bg-surface-low" onClick={() => set('productIds', [...form.productIds, p.id])}>
                      <img src={productImage(p)} alt="" className="w-9 h-9 rounded object-cover" />
                      <span className="flex-1 truncate">{p.name}</span>
                      <span className="text-on-surface-variant">{money(p.priceCents)}</span>
                      <Icon name="add" className="text-[18px] text-primary" />
                    </button>
                  </li>
                ))}
                {candidates.length === 0 && <li className="p-3 text-on-surface-variant">No more products.</li>}
              </ul>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <label className="block"><span className="label">Max price ($)</span>
                <input type="number" min="0" step="0.5" className="input mt-1" value={form.maxPrice} onChange={(e) => set('maxPrice', e.target.value)} placeholder="Any" />
              </label>
              <label className="block"><span className="label">Min discount %</span>
                <input type="number" min="1" max="95" className="input mt-1" value={form.minDiscountPct} onChange={(e) => set('minDiscountPct', e.target.value)} placeholder="Any" />
              </label>
              <label className="block"><span className="label">Order</span>
                <select className="input mt-1" value={form.sort} onChange={(e) => set('sort', e.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="price-asc">Lowest price first</option>
                  <option value="discount">Biggest discount first</option>
                </select>
              </label>
              <label className="flex items-center gap-2 mt-6"><input type="checkbox" checked={form.inStockOnly} onChange={(e) => set('inStockOnly', e.target.checked)} /> In stock only</label>
            </div>
            <div>
              <div className="label mb-1">Matches right now ({rulePreview.length}) — updates automatically as products change</div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {rulePreview.slice(0, 12).map((p) => (
                  <div key={p.id} className="w-24 shrink-0">
                    <img src={productImage(p)} alt="" className="w-24 h-24 rounded-lg object-cover" />
                    <div className="text-label-sm truncate mt-1">{p.name}</div>
                  </div>
                ))}
                {rulePreview.length === 0 && <p className="text-on-surface-variant">No products match these rules.</p>}
              </div>
            </div>
          </div>
        )}
        {err && <div role="alert" className="text-error">{err}</div>}
      </div>
    </Modal>
  );
}
