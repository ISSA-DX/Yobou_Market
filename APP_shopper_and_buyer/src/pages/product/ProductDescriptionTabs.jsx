// ProductDescriptionTabs — the three-tab block on the PDP that
// replaces the old single-paragraph description.
//
// Tabs:
//   - About this item  — the free-text description, parsed by
//     parseFeatures (newlines + bullet markers).
//   - Specifications   — a hard-coded generic spec sheet derived from
//     the product's existing fields (Brand/Category/SKU/In stock/
//     Status). We don't have a real Spec schema, so we keep the data
//     honest and the labels generic.
//   - Reviews          — embeds the ReviewsSection which fetches its
//     own data and owns its own state.
//
// State is local. We don't sync the active tab to the URL because the
// page already has #reviews anchors (and the reviews tab is the
// natural landing for /product/:id#reviews deep links).
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import Icon from '../../components/Icon';
import { parseFeatures } from '../../lib/descriptionParser';
import { formatPrice } from '../../lib/format';
import { useStore } from '../../store';
import ReviewsSection from './ReviewsSection';

const TABS = [
  { id: 'about', label: 'About this item' },
  { id: 'specs', label: 'Specifications' },
  { id: 'reviews', label: 'Reviews' },
];

export default function ProductDescriptionTabs({ product, onChanged }) {
  const [tab, setTab] = useState('about');
  const location = useLocation();
  const currency = useStore((s) => s.user?.currency || 'USD');

  // Deep-link support: #reviews in the URL opens the reviews tab. We
  // listen for both the initial hash and any later pushState-style
  // updates (e.g. the rating anchor in the page header that points
  // to #reviews).
  useEffect(() => {
    if (location.hash === '#reviews') setTab('reviews');
  }, [location.hash]);

  // Scroll the tab strip into view when the tab is changed by the
  // hash (the user expects to land on the reviews content, not just
  // have the panel switch while the tabs are off-screen).
  useEffect(() => {
    if (tab === 'reviews' && location.hash === '#reviews') {
      // Defer so the panel is mounted before the browser scrolls.
      const id = window.requestAnimationFrame(() => {
        const el = document.getElementById('reviews');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [tab, location.hash]);

  return (
    <section className="px-4 pt-2 pb-2">
      <div role="tablist" aria-label="Product details" className="flex border-b border-outline-variant/30 mb-3">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              aria-controls={`tab-panel-${t.id}`}
              id={`tab-${t.id}`}
              onClick={() => setTab(t.id)}
              className={`relative px-4 py-2.5 text-sm font-semibold transition ${
                active
                  ? 'text-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {t.label}
              {active && (
                <span
                  className="absolute left-2 right-2 -bottom-px h-0.5 bg-primary rounded-full"
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>

      <div
        id="tab-panel-about"
        role="tabpanel"
        aria-labelledby="tab-about"
        hidden={tab !== 'about'}
      >
        <AboutTab description={product.description} />
      </div>

      <div
        id="tab-panel-specs"
        role="tabpanel"
        aria-labelledby="tab-specs"
        hidden={tab !== 'specs'}
      >
        <SpecsTab product={product} currency={currency} />
      </div>

      <div
        id="tab-panel-reviews"
        role="tabpanel"
        aria-labelledby="tab-reviews"
        hidden={tab !== 'reviews'}
      >
        <ReviewsSection productId={product.id} onChanged={onChanged} />
      </div>
    </section>
  );
}

function AboutTab({ description }) {
  const parsed = parseFeatures(description);

  if (parsed.mode === 'empty') {
    return (
      <div className="text-sm text-on-surface-variant/70 italic py-2">
        No description provided.
      </div>
    );
  }
  if (parsed.mode === 'paragraph') {
    return (
      <p className="text-sm text-on-surface-variant leading-relaxed whitespace-pre-line">
        {parsed.text}
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {parsed.lines.map((line, i) => (
        <li key={i} className="flex gap-2 text-sm text-on-surface-variant leading-relaxed">
          <Icon name="check" className="text-[18px] text-primary shrink-0 mt-0.5" />
          <span>{line}</span>
        </li>
      ))}
    </ul>
  );
}

function SpecsTab({ product, currency }) {
  const rows = [
    { label: 'Category', value: product.category || '—' },
    { label: 'Brand', value: product.vendor?.businessName || '—' },
    { label: 'SKU', value: product.id },
    { label: 'Price', value: formatPrice(product.priceCents, currency) },
    {
      label: 'Availability',
      value: product.stock > 0
        ? `In stock (${product.stock} available)`
        : 'Out of stock',
    },
    { label: 'Listing status', value: product.status || '—' },
  ];
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1.5">
      {rows.map((r) => (
        <div
          key={r.label}
          className="flex items-baseline gap-3 py-1.5 border-b border-outline-variant/15"
        >
          <span className="text-label-md text-on-surface-variant w-28 shrink-0">
            {r.label}
          </span>
          <span className="text-sm text-on-surface break-all">{r.value}</span>
        </div>
      ))}
    </div>
  );
}
