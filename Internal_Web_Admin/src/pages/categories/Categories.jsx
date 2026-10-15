// Admin Categories — the catalogue structure and storefront content.
//
// Left: every category with product / subcategory counts. Right: the
// selected category's editor —
//   - Storefront content (icon, tagline, intro, featured, order, active)
//   - Subcategories (add / rename / describe / archive)
//   - Buying guide + FAQs shown at the bottom of the shopper page
//
// Server: routes/categories.js. Subcategory edits save immediately;
// the content + guide + FAQ fields save together with "Save changes".
// Every write emits `category_updated`, so the partner product form
// and the shopper category pages refresh live.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useApi, RetryError } from '../../useApi.jsx';
import { useProductLiveSync } from '../../lib/useProductLiveSync';
import { shopperCategoryUrl } from '../../lib/config';

const emptyContent = (c) => ({
  icon: c?.icon || '',
  tagline: c?.tagline || '',
  description: c?.description || '',
  featured: Boolean(c?.featured),
  sortOrder: c?.sortOrder ?? 0,
  isActive: c?.isActive !== false,
  guide: (c?.guide || []).map((g) => ({ ...g })),
  faqs: (c?.faqs || []).map((f) => ({ ...f })),
});

const errMsg = (e, fallback) => e?.data?.message || e?.data?.error || fallback;

export default function Categories() {
  const { data, error, loading, refetch } = useApi('/api/categories?includeInactive=1&curatedOnly=1');
  useProductLiveSync(refetch, { alsoCategories: true });
  const categories = data?.categories || [];

  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = [...categories].sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0) || a.name.localeCompare(b.name));
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q)
      || c.subcategories.some((s) => s.name.toLowerCase().includes(q)));
  }, [categories, query]);

  useEffect(() => {
    if (!selectedId && filtered.length) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = categories.find((c) => c.id === selectedId) || null;

  if (error && !data) return <RetryError message="Couldn't load categories." onRetry={refetch} />;

  const totalSubs = categories.reduce((n, c) => n + c.subcategories.length, 0);

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-headline-lg font-bold">Categories</h1>
          <p className="text-on-surface-variant text-sm">
            The catalogue shoppers browse and partners list into.
            {categories.length > 0 && ` ${categories.length} categories · ${totalSubs} subcategories.`}
          </p>
        </div>
        <button onClick={() => setCreating(true)} className="btn-primary"><Icon name="add" /> New category</button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 items-start">
        <aside className="card p-3 space-y-2 lg:sticky lg:top-4">
          <div className="relative">
            <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
            <input
              className="input pl-10 w-full"
              placeholder="Search categories or subcategories"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search categories"
            />
          </div>
          {loading && !data && <div className="p-4 text-sm text-on-surface-variant">Loading…</div>}
          <ul className="max-h-[70vh] overflow-y-auto -mx-1" role="listbox" aria-label="Categories">
            {filtered.map((c) => {
              const active = c.id === selectedId;
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => setSelectedId(c.id)}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left ${active ? 'bg-primary/10' : 'hover:bg-surface-low'}`}
                  >
                    <span className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${active ? 'bg-primary text-white' : 'bg-surface-low text-primary'}`}>
                      <Icon name={c.icon || 'category'} className="text-[20px]" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className={`block truncate text-sm ${active ? 'font-semibold' : 'font-medium'} ${c.isActive ? '' : 'text-on-surface-variant line-through'}`}>
                        {c.name}
                      </span>
                      <span className="block text-label-sm text-on-surface-variant">
                        {c.productCount} product{c.productCount === 1 ? '' : 's'} · {c.subcategories.length} sub
                      </span>
                    </span>
                    {c.featured && <Icon name="star" fill className="text-[18px] text-secondary" />}
                  </button>
                </li>
              );
            })}
            {!loading && filtered.length === 0 && (
              <li className="p-4 text-sm text-on-surface-variant">No categories match “{query}”.</li>
            )}
          </ul>
        </aside>

        {selected
          ? <CategoryEditor key={selected.id} category={selected} onChanged={refetch} />
          : <div className="card p-8 text-center text-on-surface-variant">Select a category to edit it.</div>}
      </div>

      <CreateCategoryModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={async (c) => { await refetch(); setSelectedId(c.id); setCreating(false); }}
      />
    </div>
  );
}

function CategoryEditor({ category, onChanged }) {
  const [form, setForm] = useState(() => emptyContent(category));
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState(null); // {type, text}
  const baseline = useMemo(() => JSON.stringify(emptyContent(category)), [category]);
  const dirty = JSON.stringify(form) !== baseline;

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  async function save() {
    setSaving(true); setMsg(null);
    try {
      const guide = form.guide.filter((g) => g.title.trim() && g.body.trim());
      const faqs = form.faqs.filter((f) => f.q.trim() && f.a.trim());
      await api(`/api/categories/${category.id}`, {
        method: 'PATCH',
        body: {
          icon: form.icon.trim() || null,
          tagline: form.tagline.trim() || null,
          description: form.description.trim() || null,
          featured: form.featured,
          sortOrder: Number(form.sortOrder) || 0,
          isActive: form.isActive,
          guide,
          faqs,
        },
      });
      await onChanged();
      setMsg({ type: 'ok', text: 'Saved. The storefront page is updated.' });
    } catch (e) {
      setMsg({ type: 'err', text: errMsg(e, 'Could not save changes.') });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5 min-w-0">
      {/* Header */}
      <div className="card p-5 flex items-center gap-4 flex-wrap">
        <span className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-primary-container text-white flex items-center justify-center shrink-0">
          <Icon name={form.icon || 'category'} className="text-[30px]" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-headline-md font-bold truncate">{category.name}</h2>
            {!category.isActive && <span className="chip bg-surface-high text-on-surface-variant">Archived</span>}
            {category.featured && <span className="chip bg-secondary/20 text-secondary">Featured</span>}
          </div>
          <p className="text-sm text-on-surface-variant">
            /{category.slug} · {category.productCount} live product{category.productCount === 1 ? '' : 's'}
          </p>
        </div>
        <a href={shopperCategoryUrl(category.slug)} target="_blank" rel="noreferrer" className="btn-secondary">
          <Icon name="open_in_new" /> View on storefront
        </a>
      </div>

      {/* Storefront content */}
      <section className="card p-5 space-y-4" aria-labelledby="cat-content-h">
        <SectionTitle id="cat-content-h" icon="storefront" title="Storefront content" hint="Shown in the hero and “About” section of the shopper category page." />
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-3">
          <Field label="Icon" hint={<>A <a className="text-primary underline" href="https://fonts.google.com/icons" target="_blank" rel="noreferrer">Material Symbols</a> name, e.g. <code>smartphone</code>.</>}>
            <input className="input w-full" value={form.icon} onChange={(e) => set('icon', e.target.value)} placeholder="category" maxLength={60} />
          </Field>
          <Field label="Display order">
            <input className="input w-full" type="number" min="0" value={form.sortOrder} onChange={(e) => set('sortOrder', e.target.value)} />
          </Field>
        </div>
        <Field label="Tagline" hint={`${form.tagline.length}/160 · One line under the category name.`}>
          <input className="input w-full" value={form.tagline} onChange={(e) => set('tagline', e.target.value)} maxLength={160} />
        </Field>
        <Field label="Introduction" hint={`${form.description.length}/1200`}>
          <textarea className="input w-full min-h-[110px]" value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={1200} />
        </Field>
        <div className="flex flex-wrap gap-5">
          <Toggle checked={form.featured} onChange={(v) => set('featured', v)} label="Featured on the Categories page" />
          <Toggle checked={form.isActive} onChange={(v) => set('isActive', v)} label="Visible to shoppers and partners" />
        </div>
      </section>

      <SubcategoriesSection category={category} onChanged={onChanged} />

      {/* Buying guide */}
      <section className="card p-5 space-y-3" aria-labelledby="cat-guide-h">
        <SectionTitle id="cat-guide-h" icon="tips_and_updates" title="Buying guide" hint="Up to 8 short tips. Shown as cards on the category page." />
        <RowsEditor
          rows={form.guide}
          onChange={(v) => set('guide', v)}
          max={8}
          fields={[
            { key: 'title', label: 'Tip title', max: 80 },
            { key: 'body', label: 'Advice', max: 500, multiline: true },
          ]}
          addLabel="Add tip"
          blank={{ title: '', body: '' }}
        />
      </section>

      {/* FAQs */}
      <section className="card p-5 space-y-3" aria-labelledby="cat-faq-h">
        <SectionTitle id="cat-faq-h" icon="quiz" title="Frequently asked questions" hint="Up to 12. Shown as an accordion at the bottom of the page." />
        <RowsEditor
          rows={form.faqs}
          onChange={(v) => set('faqs', v)}
          max={12}
          fields={[
            { key: 'q', label: 'Question', max: 160 },
            { key: 'a', label: 'Answer', max: 600, multiline: true },
          ]}
          addLabel="Add question"
          blank={{ q: '', a: '' }}
        />
      </section>

      {/* Sticky save bar for the content form */}
      <div className="sticky bottom-0 z-10 -mx-1 px-1 pb-1">
        <div className="card p-3 flex items-center justify-between gap-3 shadow-lg">
          <span className={`text-sm ${msg?.type === 'err' ? 'text-error' : 'text-on-surface-variant'}`} role="status">
            {msg?.text || (dirty ? 'You have unsaved content changes.' : 'Content is up to date.')}
          </span>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" disabled={!dirty || saving} onClick={() => { setForm(emptyContent(category)); setMsg(null); }}>
              Discard
            </button>
            <button type="button" className="btn-primary" disabled={!dirty || saving} onClick={save}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SubcategoriesSection({ category, onChanged }) {
  const [editing, setEditing] = useState(null); // sub or {} for new
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const subs = category.subcategories;

  async function toggle(s) {
    setBusy(s.id); setErr('');
    try {
      await api(`/api/categories/${category.id}/subcategories/${s.id}`, { method: 'PATCH', body: { isActive: !s.isActive } });
      await onChanged();
    } catch (e) {
      setErr(errMsg(e, 'Could not update the subcategory.'));
    } finally { setBusy(null); }
  }

  async function move(s, dir) {
    const ordered = [...subs];
    const i = ordered.findIndex((x) => x.id === s.id);
    const j = i + dir;
    if (j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    setBusy(s.id); setErr('');
    try {
      // Re-number the two swapped rows only.
      await api(`/api/categories/${category.id}/subcategories/${ordered[i].id}`, { method: 'PATCH', body: { sortOrder: i + 1 } });
      await api(`/api/categories/${category.id}/subcategories/${ordered[j].id}`, { method: 'PATCH', body: { sortOrder: j + 1 } });
      await onChanged();
    } catch (e) {
      setErr(errMsg(e, 'Could not reorder.'));
    } finally { setBusy(null); }
  }

  async function remove(s) {
    const msg = s.productCount > 0
      ? `${s.productCount} product(s) use “${s.name}”. It will be archived (hidden) instead of deleted. Continue?`
      : `Delete “${s.name}”?`;
    if (!window.confirm(msg)) return;
    setBusy(s.id); setErr('');
    try {
      await api(`/api/categories/${category.id}/subcategories/${s.id}`, { method: 'DELETE' });
      await onChanged();
    } catch (e) {
      setErr(errMsg(e, 'Could not delete the subcategory.'));
    } finally { setBusy(null); }
  }

  return (
    <section className="card p-5 space-y-3" aria-labelledby="cat-subs-h">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <SectionTitle id="cat-subs-h" icon="account_tree" title="Subcategories" hint="Partners choose one when listing a product. Changes save immediately." />
        <button type="button" className="btn-secondary" onClick={() => setEditing({})}><Icon name="add" /> Add subcategory</button>
      </div>
      {err && <div role="alert" className="text-error text-sm">{err}</div>}
      {subs.length === 0 ? (
        <p className="text-sm text-on-surface-variant py-4 text-center">No subcategories yet. Products stay at the category level until you add some.</p>
      ) : (
        <ul className="divide-y divide-outline-variant/40 border border-outline-variant/40 rounded-xl overflow-hidden">
          {subs.map((s, i) => (
            <li key={s.id} className={`flex items-center gap-3 px-3 py-2.5 ${s.isActive ? '' : 'bg-surface-low'}`}>
              <span className="w-9 h-9 rounded-lg bg-surface-low text-primary flex items-center justify-center shrink-0">
                <Icon name={s.icon || 'label'} className="text-[20px]" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-semibold truncate ${s.isActive ? '' : 'text-on-surface-variant'}`}>{s.name}</span>
                  {!s.isActive && <span className="chip bg-surface-high text-on-surface-variant">Hidden</span>}
                </div>
                <div className="text-label-sm text-on-surface-variant truncate">{s.description || 'No description'}</div>
              </div>
              <span className="text-xs text-on-surface-variant bg-surface-low rounded-full px-2 py-0.5 shrink-0" title="Live products">{s.productCount}</span>
              <div className="flex items-center shrink-0">
                <IconBtn icon="arrow_upward" label="Move up" disabled={busy || i === 0} onClick={() => move(s, -1)} />
                <IconBtn icon="arrow_downward" label="Move down" disabled={busy || i === subs.length - 1} onClick={() => move(s, 1)} />
                <IconBtn icon={s.isActive ? 'visibility' : 'visibility_off'} label={s.isActive ? 'Hide' : 'Show'} disabled={busy} onClick={() => toggle(s)} />
                <IconBtn icon="edit" label="Edit" disabled={busy} onClick={() => setEditing(s)} />
                <IconBtn icon="delete" label="Delete" disabled={busy} onClick={() => remove(s)} danger />
              </div>
            </li>
          ))}
        </ul>
      )}
      <SubcategoryModal
        category={category}
        sub={editing}
        onClose={() => setEditing(null)}
        onSaved={async () => { await onChanged(); setEditing(null); }}
      />
    </section>
  );
}

function SubcategoryModal({ category, sub, onClose, onSaved }) {
  const isNew = sub && !sub.id;
  const [form, setForm] = useState({ name: '', description: '', icon: '' });
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (sub) setForm({ name: sub.name || '', description: sub.description || '', icon: sub.icon || '' });
    setErr('');
  }, [sub]);

  async function submit(e) {
    e?.preventDefault?.();
    if (!form.name.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr('');
    const body = { name: form.name.trim(), description: form.description.trim(), icon: form.icon.trim() || null };
    try {
      if (isNew) {
        await api(`/api/categories/${category.id}/subcategories`, { method: 'POST', body });
      } else {
        await api(`/api/categories/${category.id}/subcategories/${sub.id}`, { method: 'PATCH', body });
      }
      await onSaved();
    } catch (e2) {
      setErr(errMsg(e2, 'Could not save the subcategory.'));
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open={Boolean(sub)}
      onClose={onClose}
      title={isNew ? `New subcategory in ${category.name}` : `Edit ${sub?.name || ''}`}
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Saving…' : isNew ? 'Add' : 'Save'}</button>
        </>
      )}
    >
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name">
          <input autoFocus className="input w-full" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={80} placeholder="e.g. Smartphones" />
        </Field>
        <Field label="Short description" hint={`${form.description.length}/240 · One sentence shown on the shopper tile.`}>
          <textarea className="input w-full min-h-[80px]" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={240} />
        </Field>
        <Field label="Icon" hint="Material Symbols name. Leave empty for a generic label icon.">
          <div className="flex items-center gap-2">
            <span className="w-10 h-10 rounded-lg bg-surface-low text-primary flex items-center justify-center shrink-0">
              <Icon name={form.icon || 'label'} className="text-[22px]" />
            </span>
            <input className="input w-full" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} maxLength={60} placeholder="label" />
          </div>
        </Field>
        {!isNew && sub?.productCount > 0 && form.name.trim() !== sub.name && (
          <p className="text-label-sm text-on-surface-variant">Renaming moves its {sub.productCount} product(s) to the new name.</p>
        )}
        {err && <div role="alert" className="text-error text-sm">{err}</div>}
      </form>
    </Modal>
  );
}

function CreateCategoryModal({ open, onClose, onCreated }) {
  const [name, setName] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (open) { setName(''); setErr(''); } }, [open]);

  async function submit(e) {
    e?.preventDefault?.();
    if (!name.trim()) { setErr('Name is required.'); return; }
    setSaving(true); setErr('');
    try {
      const { category } = await api('/api/categories', { method: 'POST', body: { name: name.trim() } });
      await onCreated(category);
    } catch (e2) {
      setErr(errMsg(e2, 'Could not create the category.'));
    } finally { setSaving(false); }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New category"
      footer={(
        <>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="button" className="btn-primary" onClick={submit} disabled={saving}>{saving ? 'Creating…' : 'Create'}</button>
        </>
      )}
    >
      <form onSubmit={submit} className="space-y-2">
        <Field label="Category name" hint="A URL-safe slug is generated automatically. Add content and subcategories after creating it.">
          <input autoFocus className="input w-full" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="e.g. Outdoor Gear" />
        </Field>
        {err && <div role="alert" className="text-error text-sm">{err}</div>}
      </form>
    </Modal>
  );
}

// ---- small building blocks ------------------------------------------------

function SectionTitle({ id, icon, title, hint }) {
  return (
    <div className="flex items-start gap-2">
      <Icon name={icon} className="text-[22px] text-primary mt-0.5" />
      <div>
        <h3 id={id} className="text-title-md font-semibold">{title}</h3>
        {hint && <p className="text-label-sm text-on-surface-variant">{hint}</p>}
      </div>
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="text-label-md text-on-surface-variant">{label}</span>
      <div className="mt-1">{children}</div>
      {hint && <span className="block text-label-sm text-on-surface-variant mt-1">{hint}</span>}
    </label>
  );
}

function Toggle({ checked, onChange, label }) {
  return (
    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-sm">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-10 h-6 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-outline-variant'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
      </button>
      {label}
    </label>
  );
}

function IconBtn({ icon, label, onClick, disabled, danger }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className={`w-8 h-8 rounded-md flex items-center justify-center disabled:opacity-30 ${danger ? 'text-error hover:bg-error/10' : 'text-on-surface-variant hover:bg-surface-low'}`}
    >
      <Icon name={icon} className="text-[18px]" />
    </button>
  );
}

function RowsEditor({ rows, onChange, fields, max, addLabel, blank }) {
  const update = (i, k, v) => onChange(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const remove = (i) => onChange(rows.filter((_, j) => j !== i));
  return (
    <div className="space-y-3">
      {rows.length === 0 && <p className="text-sm text-on-surface-variant">Nothing here yet.</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex gap-3 items-start border border-outline-variant/40 rounded-xl p-3">
          <span className="w-7 h-7 rounded-full bg-primary/10 text-primary text-sm font-semibold flex items-center justify-center shrink-0 mt-6">{i + 1}</span>
          <div className="flex-1 space-y-2 min-w-0">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {f.multiline
                  ? <textarea className="input w-full min-h-[70px]" value={r[f.key] || ''} maxLength={f.max} onChange={(e) => update(i, f.key, e.target.value)} />
                  : <input className="input w-full" value={r[f.key] || ''} maxLength={f.max} onChange={(e) => update(i, f.key, e.target.value)} />}
              </Field>
            ))}
          </div>
          <IconBtn icon="delete" label="Remove" onClick={() => remove(i)} danger />
        </div>
      ))}
      {rows.length < max && (
        <button type="button" className="btn-secondary" onClick={() => onChange([...rows, { ...blank }])}>
          <Icon name="add" /> {addLabel}
        </button>
      )}
    </div>
  );
}
