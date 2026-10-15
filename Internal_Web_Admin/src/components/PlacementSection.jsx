// PlacementSection — "Where shoppers see this product" on the product
// form (admin and partner). Three parts:
//
//   1. Category pages — the primary category/department (set above),
//      "Also show in" pins to other category / department pages, and the
//      Category spotlight switch.
//   2. Surface switches grouped as the shopper app is laid out (Home,
//      Deals, Search) — definitions in lib/placement.js.
//   3. A live "Appears on" summary of everything the switches add up to.
//
// Partners see `reviewNote` (their changes go through admin approval).
// Kept identical in Internal_Web_Admin and Partner_Web_Vendor by copy.
import { useMemo, useState } from 'react';
import { useApi } from '../useApi';
import Icon from './Icon';
import { SURFACE_GROUPS, describePlacements, pinLabel, pinsFromProduct } from '../lib/placement';

const MAX_PINS = 10;

function Toggle({ id, label, helper, icon, checked, onChange }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${checked ? 'bg-primary/10 text-primary' : 'bg-surface-low text-on-surface-variant'}`}>
        <Icon name={icon} className="text-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="text-sm font-medium text-on-surface cursor-pointer">{label}</label>
        <div className="text-label-sm text-on-surface-variant mt-0.5">{helper}</div>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-11 h-6 rounded-full relative transition-colors mt-1 ${checked ? 'bg-primary' : 'bg-outline-variant/60'}`}
      >
        <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-card transition-transform ${checked ? 'translate-x-5' : ''}`} />
      </button>
    </div>
  );
}

export default function PlacementSection({ form, update, errors = {}, reviewNote }) {
  const { data, error: fetchErr } = useApi('/api/categories');
  const categories = useMemo(() => (data?.categories || []).filter((c) => c.isActive !== false && c.source !== 'live'), [data]);
  const pins = pinsFromProduct(form);

  // Pin picker state: a category, then optionally one of its departments.
  const [pinCat, setPinCat] = useState('');
  const [pinSub, setPinSub] = useState('');
  const pinnable = categories.filter((c) => c.name !== form.category && !pins.some((p) => p.name === c.name));
  const pinCatRow = categories.find((c) => c.name === pinCat);
  const pinSubs = (pinCatRow?.subcategories || []).filter((s) => s.isActive !== false);

  function addPin() {
    if (!pinCat || pins.length >= MAX_PINS) return;
    update('extraCategories', [...pins, { name: pinCat, subcategory: pinSub || null }]);
    setPinCat('');
    setPinSub('');
  }

  function removePin(name) {
    update('extraCategories', pins.filter((p) => p.name !== name));
  }

  const summary = describePlacements({ ...form, extraCategories: pins });

  return (
    <section aria-labelledby="pf-placement" className="card border border-outline-variant/30 p-4 space-y-5 bg-surface-low/30">
      <div>
        <h3 id="pf-placement" className="font-bold text-base flex items-center gap-2">
          <Icon name="storefront" className="text-[20px] text-primary" /> Where shoppers see this product
        </h3>
        <p className="text-label-md text-on-surface-variant">
          Choose every page and section this product appears on.
          {reviewNote ? ` ${reviewNote}` : ''}
        </p>
      </div>

      {/* 1. Category pages */}
      <div>
        <GroupTitle icon="category" title="Category pages" />
        <div className="rounded-xl border border-outline-variant/40 bg-white divide-y divide-outline-variant/30 px-3">
          <div className="flex items-start gap-3 py-2.5">
            <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-primary/10 text-primary">
              <Icon name="home_pin" className="text-[18px]" />
            </span>
            <div className="min-w-0">
              <div className="text-sm font-medium">Main page</div>
              <div className="text-label-sm text-on-surface-variant">
                {form.category
                  ? <><span className="font-semibold text-on-surface">{form.subcategory ? `${form.category} › ${form.subcategory}` : form.category}</span> — set by Category and Subcategory above.</>
                  : 'Choose a category above.'}
              </div>
            </div>
          </div>

          <div className="py-2.5 space-y-2">
            <div className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-surface-low text-on-surface-variant">
                <Icon name="push_pin" className="text-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium">Also show in</div>
                <div className="text-label-sm text-on-surface-variant">
                  Pin this product to other category or department pages — e.g. a skillet under Home › Décor gifts. Up to {MAX_PINS}.
                </div>
              </div>
            </div>

            {pins.length > 0 && (
              <ul className="flex flex-wrap gap-1.5 pl-11" aria-label="Pinned pages">
                {pins.map((pin) => (
                  <li key={pin.name}>
                    <span className="inline-flex items-center gap-1 pl-2.5 pr-1 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                      {pinLabel(pin)}
                      <button type="button" onClick={() => removePin(pin.name)} aria-label={`Remove ${pinLabel(pin)}`} className="w-5 h-5 rounded-full flex items-center justify-center hover:bg-primary/20">
                        <Icon name="close" className="text-[14px]" />
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            )}

            {pins.length < MAX_PINS && (
              <div className="pl-11 grid grid-cols-2 gap-2">
                <select className="input" value={pinCat} onChange={(e) => { setPinCat(e.target.value); setPinSub(''); }} aria-label="Category to pin to">
                  <option value="">Choose a category…</option>
                  {pinnable.map((c) => <option key={c.id || c.name} value={c.name}>{c.name}</option>)}
                </select>
                <select className="input" value={pinSub} onChange={(e) => setPinSub(e.target.value)} disabled={!pinCat || pinSubs.length === 0} aria-label="Department to pin to">
                  <option value="">{pinCat && pinSubs.length === 0 ? 'No departments' : 'Whole category'}</option>
                  {pinSubs.map((s) => <option key={s.id} value={s.name}>{s.name}</option>)}
                </select>
                <button type="button" className="btn-secondary col-span-2 justify-self-start" onClick={addPin} disabled={!pinCat}>
                  <Icon name="push_pin" /> {pinCat ? `Pin to ${pinSub ? `${pinCat} › ${pinSub}` : pinCat}` : 'Pin'}
                </button>
              </div>
            )}
            {fetchErr && <div className="pl-11 text-error text-sm">Couldn’t load categories.</div>}
            {errors.extraCategories && <div role="alert" className="pl-11 text-error text-sm">{errors.extraCategories}</div>}
          </div>

          {SURFACE_GROUPS.find((g) => g.key === 'category').items.map((s) => (
            <Toggle key={s.key} id={`pf-${s.key}`} label={s.label} helper={s.helper} icon={s.icon} checked={Boolean(form[s.key])} onChange={(v) => update(s.key, v)} />
          ))}
        </div>
      </div>

      {/* 2. Other surfaces */}
      {SURFACE_GROUPS.filter((g) => g.key !== 'category').map((g) => (
        <div key={g.key}>
          <GroupTitle icon={g.icon} title={g.title} />
          <div className="rounded-xl border border-outline-variant/40 bg-white divide-y divide-outline-variant/30 px-3">
            {g.items.map((s) => (
              <Toggle key={s.key} id={`pf-${s.key}`} label={s.label} helper={s.helper} icon={s.icon} checked={Boolean(form[s.key])} onChange={(v) => update(s.key, v)} />
            ))}
          </div>
        </div>
      ))}

      {/* 3. Summary */}
      <div className="rounded-xl bg-primary/5 border border-primary/20 p-3">
        <div className="text-sm font-semibold flex items-center gap-1.5 mb-2">
          <Icon name="visibility" className="text-[18px] text-primary" /> Appears on
        </div>
        {summary.length === 0 ? (
          <p className="text-label-md text-on-surface-variant">Nowhere yet — choose a category above.</p>
        ) : (
          <ul className="flex flex-wrap gap-1.5">
            {summary.map((s) => (
              <li key={s.text} className="inline-flex items-center gap-1 rounded-full bg-white border border-outline-variant/40 px-2.5 py-1 text-xs font-medium">
                <Icon name={s.icon} className="text-[14px] text-primary" /> {s.text}
              </li>
            ))}
          </ul>
        )}
        {form.showOnDeals && !(form.compareAtPriceCents != null && Number(form.compareAtPriceCents) > Number(form.priceCents || 0)) && (
          <p className="text-label-sm text-on-surface-variant mt-2">Deals is on, but it only shows once you set a “was” price above the current price.</p>
        )}
        {form.status && form.status !== 'LIVE' && (
          <p className="text-label-sm text-on-surface-variant mt-2">Status is {form.status.toLowerCase()} — nothing shows until it is Live.</p>
        )}
      </div>
    </section>
  );
}

function GroupTitle({ icon, title }) {
  return (
    <div className="flex items-center gap-1.5 mb-1.5 text-label-md font-semibold text-on-surface-variant uppercase tracking-wide">
      <Icon name={icon} className="text-[16px]" /> {title}
    </div>
  );
}
