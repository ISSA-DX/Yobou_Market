// PlacementSection — "Where shoppers see this product" controls on the
// partner (and mirrored on the admin) product form. Renders inside
// ProductFormFields below the description field.
//
// Two pieces:
//   1. Four boolean toggles — Home, Deals, Flash deals, Search — that
//      gate whether the product shows up on the corresponding shopper
//      surface. Defaults match the Product schema (home/deals/search ON,
//      flash OFF), so a freshly published product appears everywhere by
//      default.
//   2. A multi-select chip picker for extra categories — additional
//      pins beyond the primary `category`. Free-text; the server
//      normalizes (trim / dedupe / cap 10 / cap 80 chars per name) and
//      the curated Category table is just a convenience source list.
//
// Identical implementation in Internal_Web_Admin/src/components/PlacementSection.jsx
// (kept in sync; copy-paste mirror, not a shared package).
import { useApi } from '../useApi';
import Icon from './Icon';

// One toggle row. Controlled; surfaces (label, helper, on/off state) all
// come from the parent so the form schema can validate them in one place.
function Toggle({ id, label, helper, checked, onChange, error }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-medium text-on-surface">
          {label}
        </label>
        <div className="text-label-sm text-on-surface-variant mt-0.5">
          {helper}
        </div>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`shrink-0 w-11 h-6 rounded-full relative transition-colors ${
          checked ? 'bg-primary' : 'bg-outline-variant/60'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-card transition-transform ${
            checked ? 'translate-x-5' : ''
          }`}
        />
      </button>
      {error && <div className="text-error text-xs mt-1">{error}</div>}
    </div>
  );
}

export default function PlacementSection({ form, update, errors = {} }) {
  // Reuse the same /api/categories list the primary CategoryPicker uses.
  // The curated table is the source of suggestions; free-text entries
  // are still allowed (the server stores raw strings), so a vendor can
  // pin to a category that doesn't exist in the curated table yet.
  const { data, error: fetchErr } = useApi('/api/categories');
  const all = data?.categories || [];
  const curated = all.filter((c) => c.isActive !== false);

  const selectedExtras = Array.isArray(form.extraCategories) ? form.extraCategories : [];

  function toggleExtra(name) {
    const set = new Set(selectedExtras);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    update('extraCategories', Array.from(set));
  }

  function addCustomExtra(e) {
    e.preventDefault();
    const raw = e.currentTarget.elements.customExtra?.value?.trim();
    if (!raw) return;
    if (selectedExtras.includes(raw)) {
      e.currentTarget.reset();
      return;
    }
    if (selectedExtras.length >= 10) return;
    update('extraCategories', [...selectedExtras, raw]);
    e.currentTarget.reset();
  }

  // Suggested = curated minus the primary category (which is the
  // product's main page, not an "extra"). The primary is surfaced in
  // the form above so we don't show it twice.
  const suggestions = curated.filter((c) => c.name !== form.category);

  return (
    <section
      aria-labelledby="pf-placement"
      className="card border border-outline-variant/30 p-4 space-y-4 bg-surface-low/30"
    >
      <div>
        <h3 id="pf-placement" className="font-bold text-base">
          Where shoppers see this product
        </h3>
        <p className="text-label-md text-on-surface-variant">
          Turn surfaces on or off, and pin this product to additional categories.
        </p>
      </div>

      <div className="space-y-1 divide-y divide-outline-variant/30">
        <Toggle
          id="pf-show-on-home"
          label="Home"
          helper="Show in the Home main grid, mixed with all other live products."
          checked={Boolean(form.showOnHome)}
          onChange={(v) => update('showOnHome', v)}
          error={errors.showOnHome}
        />
        <Toggle
          id="pf-show-on-deals"
          label="Deals"
          helper="Show in the Home Deals rail. Products with a strikethrough price still auto-appear unless you turn this off."
          checked={Boolean(form.showOnDeals)}
          onChange={(v) => update('showOnDeals', v)}
          error={errors.showOnDeals}
        />
        <Toggle
          id="pf-show-on-flash"
          label="Flash deals"
          helper="Show in the Flash deals rail — a curated rail on Home for handpicked products. Off by default."
          checked={Boolean(form.showOnFlashDeals)}
          onChange={(v) => update('showOnFlashDeals', v)}
          error={errors.showOnFlashDeals}
        />
        <Toggle
          id="pf-show-on-search"
          label="Search"
          helper="Match buyer searches across the app."
          checked={Boolean(form.showOnSearch)}
          onChange={(v) => update('showOnSearch', v)}
          error={errors.showOnSearch}
        />
      </div>

      <div className="space-y-2 pt-1">
        <div>
          <span className="text-sm font-medium text-on-surface">Extra categories</span>
          <div className="text-label-sm text-on-surface-variant mt-0.5">
            Pin this product to more than one category. The primary category above is always on its own page.
          </div>
        </div>

        {selectedExtras.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" aria-label="Selected extra categories">
            {selectedExtras.map((name) => (
              <li key={name}>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium">
                  {name}
                  <button
                    type="button"
                    onClick={() => toggleExtra(name)}
                    aria-label={`Remove ${name}`}
                    className="w-4 h-4 rounded-full flex items-center justify-center hover:bg-primary/20"
                  >
                    <Icon name="close" className="text-[12px]" />
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}

        {suggestions.length > 0 && (
          <div>
            <div className="text-label-sm text-on-surface-variant mb-1">Suggestions</div>
            <ul className="flex flex-wrap gap-1.5">
              {suggestions.map((c) => {
                const selected = selectedExtras.includes(c.name);
                return (
                  <li key={c.id || c.name}>
                    <button
                      type="button"
                      onClick={() => toggleExtra(c.name)}
                      aria-pressed={selected}
                      className={`px-2 py-0.5 rounded-full text-xs font-medium border transition-colors ${
                        selected
                          ? 'bg-primary text-white border-primary'
                          : 'bg-white text-on-surface border-outline-variant/40 hover:border-primary'
                      }`}
                    >
                      {selected ? '✓ ' : '+ '}{c.name}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {fetchErr && (
          <div className="text-error text-sm">Couldn't load category suggestions.</div>
        )}

        <form onSubmit={addCustomExtra} className="flex gap-2">
          <input
            name="customExtra"
            type="text"
            placeholder="Add custom category…"
            maxLength={80}
            className="input flex-1"
            disabled={selectedExtras.length >= 10}
            aria-label="Add custom extra category"
          />
          <button
            type="submit"
            className="btn-secondary"
            disabled={selectedExtras.length >= 10}
          >
            Add
          </button>
        </form>
        <div className="text-label-sm text-on-surface-variant">
          {selectedExtras.length}/10 extras. Each up to 80 characters.
        </div>
        {errors.extraCategories && (
          <div role="alert" className="text-error text-sm">{errors.extraCategories}</div>
        )}
      </div>
    </section>
  );
}
