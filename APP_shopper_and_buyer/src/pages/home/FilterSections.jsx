// Search filters (category, brand, price, in stock). Shared by the phone
// bottom sheet (FilterSheet in Search.jsx — applied with its Apply
// button) and the laptop sidebar (SearchSidebar — applied as you tick;
// the price range applies with its Go button, `onApplyPrice`).
import Icon from '../../components/Icon';

export default function FilterSections({ facets, draft, setDraft, onApplyPrice }) {
  const toggle = (key, v) => setDraft({
    ...draft,
    [key]: draft[key].includes(v) ? draft[key].filter((x) => x !== v) : [...draft[key], v],
  });

  return (
    <div className="space-y-6">
      {facets.categories?.length > 0 && (
        <section>
          <h3 className="text-title-md font-bold mb-2">Category</h3>
          <ul className="space-y-1.5">
            {facets.categories.map((c) => (
              <li key={c.name}>
                <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={draft.category.includes(c.name)} onChange={() => toggle('category', c.name)} className="w-5 h-5 accent-primary" />
                  <span className="flex-1">{c.name}</span>
                  <span className="text-label-md text-on-surface-variant tabular-nums">{c.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {facets.vendors?.length > 0 && (
        <section>
          <h3 className="text-title-md font-bold mb-2">Brand</h3>
          <ul className="space-y-1.5">
            {facets.vendors.map((v) => (
              <li key={v.id}>
                <label className="flex items-center gap-3 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={draft.vendor.includes(v.id)} onChange={() => toggle('vendor', v.id)} className="w-5 h-5 accent-primary" />
                  <span className="flex-1">{v.name}</span>
                  <span className="text-label-md text-on-surface-variant tabular-nums">{v.count}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Price inputs are in cents to match the API's priceCents field;
          the helper line shows the shop's range in dollars. */}
      <section>
        <h3 className="text-title-md font-bold mb-2">Price</h3>
        <form
          className="flex items-center gap-2"
          onSubmit={(e) => { e.preventDefault(); onApplyPrice?.(); }}
        >
          <PriceInput placeholder="Min" label="Minimum price (cents)" value={draft.minPrice} onChange={(v) => setDraft({ ...draft, minPrice: v })} />
          <span className="text-on-surface-variant">–</span>
          <PriceInput placeholder="Max" label="Maximum price (cents)" value={draft.maxPrice} onChange={(v) => setDraft({ ...draft, maxPrice: v })} />
          {onApplyPrice && (
            <button type="submit" className="h-11 px-3 rounded-lg bg-primary text-white text-sm font-semibold shrink-0" aria-label="Apply price range">Go</button>
          )}
        </form>
        {facets.priceRange && facets.priceRange.min != null && facets.priceRange.max != null && (
          <p className="text-label-md text-on-surface-variant mt-2">
            In this shop: ${(facets.priceRange.min / 100).toFixed(2)}–${(facets.priceRange.max / 100).toFixed(2)}
          </p>
        )}
      </section>

      <section>
        <label className="flex items-center justify-between py-1.5 cursor-pointer gap-3">
          <span className="text-title-md font-bold flex-1">In stock only</span>
          <button
            type="button"
            role="switch"
            aria-checked={draft.inStock}
            onClick={() => setDraft({ ...draft, inStock: !draft.inStock })}
            className={`relative w-11 h-6 rounded-full transition-colors flex-none ${draft.inStock ? 'bg-primary' : 'bg-outline-variant'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${draft.inStock ? 'translate-x-5' : ''}`} />
          </button>
        </label>
      </section>
    </div>
  );
}

function PriceInput({ placeholder, label, value, onChange }) {
  return (
    <div className="flex-1 relative min-w-0">
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
      <input
        type="number"
        inputMode="numeric"
        min="0"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input pl-7 w-full"
        aria-label={label}
      />
    </div>
  );
}

// Laptop filter column beside the results (hidden on phones, which use
// the bottom sheet).
export function SearchSidebar({ facets, draft, activeFilterCount, onChange, onApplyPrice, onClear }) {
  if (!facets) return null;
  return (
    <aside aria-label="Filters" className="hidden lg:block sticky top-[148px] max-h-[calc(100vh-170px)] overflow-y-auto card p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-title-lg font-bold flex items-center gap-2"><Icon name="tune" className="text-[22px]" /> Filters</h2>
        {activeFilterCount > 0 && (
          <button type="button" onClick={onClear} className="text-sm text-primary font-semibold">Clear all</button>
        )}
      </div>
      <FilterSections facets={facets} draft={draft} setDraft={onChange} onApplyPrice={onApplyPrice} />
    </aside>
  );
}
