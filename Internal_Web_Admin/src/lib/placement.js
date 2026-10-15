// Product placement — what each storefront surface is called and where
// it lives in the shopper app. Mirrors server/src/lib/placement.js (the
// flag keys and defaults must match). Used by the product form
// (PlacementSection), the admin bulk tool and the product list badges.
//
// Kept identical in Internal_Web_Admin and Partner_Web_Vendor by copy.

export const SURFACE_GROUPS = [
  {
    key: 'category',
    title: 'Category pages',
    icon: 'category',
    items: [
      {
        key: 'showOnCategorySpotlight',
        label: 'Category spotlight',
        short: 'Spotlight',
        icon: 'auto_awesome',
        default: false,
        helper: 'Feature in the banner carousel at the top of its category and department pages (and any page it is pinned to).',
      },
    ],
  },
  {
    key: 'home',
    title: 'Home page',
    icon: 'home',
    items: [
      { key: 'showOnHome', label: 'Home feed', short: 'Home', icon: 'grid_view', default: true, helper: 'Appear in the main product feed on Home.' },
      { key: 'showOnNewArrivals', label: 'New arrivals', short: 'New', icon: 'new_releases', default: true, helper: 'Appear in “New arrivals” on Home and “New in …” on its category page, newest first.' },
      { key: 'showOnRecentDeals', label: 'Recent deals', short: 'Recent deals', icon: 'history', default: false, helper: 'Feature in the Home “Recent deals” rail. Best with a deal price set.' },
    ],
  },
  {
    key: 'deals',
    title: 'Deals',
    icon: 'local_offer',
    items: [
      { key: 'showOnDeals', label: 'Deals', short: 'Deals', icon: 'sell', default: true, helper: 'Allowed in the Deals rails on Home and “Top deals” on category pages — only when it has a deal price.' },
      { key: 'showOnFlashDeals', label: 'Flash deals', short: 'Flash', icon: 'bolt', default: false, helper: 'Feature in Flash deals (with countdown) on Home and on its category pages.' },
    ],
  },
  {
    key: 'search',
    title: 'Search',
    icon: 'search',
    items: [
      { key: 'showOnSearch', label: 'Search results', short: 'Search', icon: 'manage_search', default: true, helper: 'Match shoppers’ searches across the app.' },
    ],
  },
];

export const SURFACES = SURFACE_GROUPS.flatMap((g) => g.items);

/** Form defaults for every placement flag. */
export const PLACEMENT_DEFAULTS = Object.fromEntries(SURFACES.map((s) => [s.key, s.default]));

/** Read placement flags off a product, falling back to defaults. */
export function placementFromProduct(p) {
  return Object.fromEntries(SURFACES.map((s) => [s.key, p?.[s.key] !== undefined && p?.[s.key] !== null ? Boolean(p[s.key]) : s.default]));
}

/** Pins in the shape the form and API use: [{ name, subcategory|null }]. */
export function pinsFromProduct(p) {
  return (Array.isArray(p?.extraCategories) ? p.extraCategories : []).map((e) => (
    typeof e === 'string' ? { name: e, subcategory: null } : { name: e.name, subcategory: e.subcategory || null }
  ));
}

export const pinLabel = (pin) => (pin.subcategory ? `${pin.name} › ${pin.subcategory}` : pin.name);

/**
 * Plain-language list of every place a product will appear, for the
 * "Where this product appears" summary. `hasDeal` = compare-at price set.
 */
export function describePlacements(form) {
  const out = [];
  if (form.category) {
    out.push({ icon: 'category', text: form.subcategory ? `${form.category} › ${form.subcategory} page` : `${form.category} page` });
  }
  for (const pin of pinsFromProduct(form)) out.push({ icon: 'push_pin', text: `${pinLabel(pin)} page (pinned)` });
  const hasDeal = form.compareAtPriceCents != null && Number(form.compareAtPriceCents) > Number(form.priceCents || 0);
  for (const s of SURFACES) {
    if (!form[s.key]) continue;
    if (s.key === 'showOnDeals' && !hasDeal) continue; // needs a deal price to show
    out.push({ icon: s.icon, text: s.label });
  }
  return out;
}
