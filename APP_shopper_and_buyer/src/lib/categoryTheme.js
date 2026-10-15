// Visual identity per category — one place for the hero gradient and the
// pastel tile colour, so Home, Categories and every category page render
// a category the same way. Content (names, icons, taglines, subcategories)
// comes from the API; this file only holds colour, keyed by slug.
//
// Tailwind needs the class names spelled out literally, which is why the
// full strings live here rather than being composed at runtime.

const THEMES = {
  electronics: { gradient: 'from-blue-500 to-indigo-600', tile: 'bg-blue-50 text-blue-600' },
  phones: { gradient: 'from-indigo-500 to-violet-600', tile: 'bg-indigo-50 text-indigo-600' },
  computer: { gradient: 'from-slate-600 to-slate-800', tile: 'bg-slate-100 text-slate-700' },
  fashion: { gradient: 'from-pink-500 to-rose-500', tile: 'bg-pink-50 text-pink-600' },
  shoes: { gradient: 'from-orange-500 to-amber-500', tile: 'bg-orange-50 text-orange-600' },
  beauty: { gradient: 'from-rose-400 to-fuchsia-500', tile: 'bg-rose-50 text-rose-500' },
  home: { gradient: 'from-amber-500 to-orange-600', tile: 'bg-amber-50 text-amber-700' },
  kitchen: { gradient: 'from-teal-500 to-emerald-600', tile: 'bg-teal-50 text-teal-600' },
  sports: { gradient: 'from-green-500 to-emerald-600', tile: 'bg-green-50 text-green-600' },
  fitness: { gradient: 'from-lime-500 to-green-600', tile: 'bg-lime-50 text-lime-700' },
  toys: { gradient: 'from-yellow-400 to-orange-500', tile: 'bg-yellow-50 text-yellow-600' },
  gaming: { gradient: 'from-violet-500 to-purple-700', tile: 'bg-violet-50 text-violet-600' },
  'tv-audio': { gradient: 'from-cyan-500 to-blue-600', tile: 'bg-cyan-50 text-cyan-700' },
  appliances: { gradient: 'from-stone-500 to-stone-700', tile: 'bg-stone-100 text-stone-700' },
  automotive: { gradient: 'from-red-500 to-rose-600', tile: 'bg-red-50 text-red-600' },
  books: { gradient: 'from-emerald-500 to-teal-700', tile: 'bg-emerald-50 text-emerald-700' },
  grocery: { gradient: 'from-lime-600 to-green-700', tile: 'bg-lime-50 text-lime-800' },
  health: { gradient: 'from-sky-500 to-cyan-600', tile: 'bg-sky-50 text-sky-600' },
  'pet-supplies': { gradient: 'from-amber-500 to-orange-600', tile: 'bg-amber-50 text-amber-600' },
  baby: { gradient: 'from-fuchsia-400 to-pink-500', tile: 'bg-fuchsia-50 text-fuchsia-600' },
  jewelry: { gradient: 'from-purple-500 to-indigo-600', tile: 'bg-purple-50 text-purple-600' },
  watches: { gradient: 'from-zinc-500 to-zinc-700', tile: 'bg-zinc-100 text-zinc-700' },
  bags: { gradient: 'from-orange-500 to-amber-600', tile: 'bg-orange-50 text-orange-700' },
  office: { gradient: 'from-neutral-500 to-neutral-700', tile: 'bg-neutral-100 text-neutral-700' },
  garden: { gradient: 'from-green-600 to-emerald-700', tile: 'bg-green-50 text-green-700' },
  tools: { gradient: 'from-gray-500 to-gray-700', tile: 'bg-gray-100 text-gray-700' },
  'arts-crafts': { gradient: 'from-fuchsia-500 to-purple-600', tile: 'bg-fuchsia-50 text-fuchsia-700' },
  'musical-instruments': { gradient: 'from-red-500 to-pink-600', tile: 'bg-red-50 text-red-500' },
};

const FALLBACK = { gradient: 'from-primary to-primary-container', tile: 'bg-primary/10 text-primary' };

export function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Theme for a category (by slug or name), with the icon resolved. */
export function themeFor(category) {
  const slug = category?.slug || slugify(category?.name);
  return { ...(THEMES[slug] || FALLBACK), icon: category?.icon || 'category' };
}

/** Canonical link to a category page (optionally a subcategory). */
export function categoryPath(category, sub) {
  const slug = category?.slug || slugify(category?.name || category);
  const base = `/categories/${slug}`;
  if (!sub) return base;
  return `${base}/${sub.slug || slugify(sub.name || sub)}`;
}
