import { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard from '../../components/ProductCard';
import { useApi, RetryError } from '../../useApi.jsx';
import { useNotifications } from '../../lib/useNotifications';
import { useProductLiveSync } from '../../lib/useProductLiveSync';
import { useRecentlyViewed } from '../../lib/useRecentlyViewed';
import { toast } from '../../lib/toast';

const CATS = [
  { name: 'Electronics', icon: 'devices', color: 'bg-blue-50 text-blue-600' },
  { name: 'Phones', icon: 'smartphone', color: 'bg-indigo-50 text-indigo-600' },
  { name: 'Computers', icon: 'computer', color: 'bg-slate-100 text-slate-700' },
  { name: 'Fashion', icon: 'checkroom', color: 'bg-pink-50 text-pink-600' },
  { name: 'Shoes', icon: 'steps', color: 'bg-orange-50 text-orange-600' },
  { name: 'Beauty', icon: 'spa', color: 'bg-rose-50 text-rose-500' },
  { name: 'Home', icon: 'chair', color: 'bg-amber-50 text-amber-700' },
  { name: 'Kitchen', icon: 'blender', color: 'bg-teal-50 text-teal-600' },
  { name: 'Sports', icon: 'sports_basketball', color: 'bg-green-50 text-green-600' },
  { name: 'Fitness', icon: 'fitness_center', color: 'bg-lime-50 text-lime-700' },
  { name: 'Toys', icon: 'toys', color: 'bg-yellow-50 text-yellow-600' },
  { name: 'Gaming', icon: 'sports_esports', color: 'bg-violet-50 text-violet-600' },
  { name: 'TV & Audio', icon: 'tv', color: 'bg-cyan-50 text-cyan-700' },
  { name: 'Appliances', icon: 'kitchen', color: 'bg-stone-100 text-stone-700' },
  { name: 'Automotive', icon: 'directions_car', color: 'bg-red-50 text-red-600' },
  { name: 'Books', icon: 'menu_book', color: 'bg-emerald-50 text-emerald-700' },
  { name: 'Grocery', icon: 'local_grocery_store', color: 'bg-lime-50 text-lime-800' },
  { name: 'Health', icon: 'medical_services', color: 'bg-sky-50 text-sky-600' },
  { name: 'Pet Supplies', icon: 'pets', color: 'bg-amber-50 text-amber-600' },
  { name: 'Baby', icon: 'child_care', color: 'bg-fuchsia-50 text-fuchsia-600' },
  { name: 'Jewelry', icon: 'diamond', color: 'bg-purple-50 text-purple-600' },
  { name: 'Watches', icon: 'watch', color: 'bg-zinc-100 text-zinc-700' },
  { name: 'Bags', icon: 'shopping_bag', color: 'bg-orange-50 text-orange-700' },
  { name: 'Office', icon: 'print', color: 'bg-neutral-100 text-neutral-700' },
  { name: 'Garden', icon: 'yard', color: 'bg-green-50 text-green-700' },
  { name: 'Tools', icon: 'construction', color: 'bg-gray-100 text-gray-700' },
  { name: 'Arts & Crafts', icon: 'brush', color: 'bg-fuchsia-50 text-fuchsia-700' },
  { name: 'Musical', icon: 'music_note', color: 'bg-red-50 text-red-500' },
];

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore((s) => s.user);
  const { unreadCount } = useNotifications(10);
  const [q, setQ] = useState('');
  const { data, error, loading, refetch } = useApi('/api/products');
  // Live sync — Home page refetches when any product is created/updated/deleted.
  useProductLiveSync(refetch);
  // Recently viewed rail — guest-friendly via localStorage.
  const { ids: recentIds, clear: clearRecent } = useRecentlyViewed();

  const all = data?.products || [];
  // "Deals" — products with a real compare-at price set higher than the
  // current price. We sort by discount % so the biggest savings lead the
  // section. The hero banner below uses the top deal to render a real
  // copy line, not generic marketing. If no product has a discount
  // configured, the section silently disappears — no fake "Up to 50% off"
  // banner that isn't backed by data.
  const deals = all
    .filter((p) => typeof p.compareAtPriceCents === 'number'
      && p.compareAtPriceCents > (p.priceCents || 0)
      && p.stock > 0)
    .sort((a, b) => {
      const da = (a.compareAtPriceCents - (a.priceCents || 0)) / a.compareAtPriceCents;
      const db = (b.compareAtPriceCents - (b.priceCents || 0)) / b.compareAtPriceCents;
      return db - da;
    });
  const topDeal = deals[0] || null;
  const dealCount = deals.length;

  // "Flash deals" — handpicked subset of products the admin / vendor
  // opted in to via Product.showOnFlashDeals. Hidden when nothing is
  // flagged, so an empty shop doesn't render a dead section. Sorted by
  // newest first (createdAt desc) so the freshest promotion leads.
  // Capped at 8 cards so the rail stays a single row of horizontal
  // scroll, matching the Deals rail above it.
  const flashDeals = all
    .filter((p) => p.showOnFlashDeals === true && p.stock > 0)
    .sort((a, b) => {
      const ta = new Date(a.createdAt || 0).getTime();
      const tb = new Date(b.createdAt || 0).getTime();
      return tb - ta;
    })
    .slice(0, 8);

  async function quickAdd(p) {
    try {
      await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: 1 } });
      await useStore.getState().refreshCartCount();
      toast.success(`Added ${p.name} to cart`);
    } catch (e) {
      // Not logged in — bounce to login, then come back here
      navigate('/login', { state: { from: location } });
    }
  }

  return (
    <div className="px-4 pt-4 pb-6 space-y-6">
      {/* Top bar — page-level actions. The brand mark + wordmark live in
          MobileShell's persistent sticky header, so this row only carries the
          menu / search / notifications icons (and a flex spacer on the left
          where the brand mark would otherwise be). */}
      <header className="flex items-center justify-between">
        <Link to="/categories" className="p-2 -ml-2" aria-label="Menu">
          <Icon name="menu" className="text-[24px]" />
        </Link>
        <div className="flex items-center gap-1">
          <Link to={`/search?q=${encodeURIComponent(q)}`} className="p-2" aria-label="Search">
            <Icon name="search" className="text-[24px]" />
          </Link>
          <Link
            to="/notifications"
            className="p-2 relative"
            aria-label={`Notifications (${unreadCount} unread)`}
          >
            <Icon name="notifications" className="text-[24px]" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[11px] font-bold flex items-center justify-center">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </Link>
        </div>
      </header>

      {/* Greeting */}
      <div>
        <div className="text-label-md text-on-surface-variant">Hi, {user?.name?.split(' ')[0] || 'there'} 👋</div>
        <h1 className="text-headline-lg font-bold">What are you shopping for today?</h1>
      </div>

      {/* Search */}
      <div className="relative">
        <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
        <input
          className="input pl-10"
          placeholder="Search products, brands, categories…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') navigate(`/search?q=${encodeURIComponent(q)}`);
          }}
        />
      </div>

      {error && !data ? (
        <RetryError message="Couldn't load products." onRetry={refetch} />
      ) : null}

      {/* Hero banner — data-driven when a real deal exists, otherwise a
          neutral on-brand welcome card. Renders nothing misleading. */}
      {topDeal ? (
        <Link
          to={`/product/${topDeal.id}`}
          className="card p-5 bg-gradient-to-br from-primary to-primary-container text-white relative overflow-hidden block"
        >
          <div className="relative z-10 max-w-[60%]">
            <div className="chip bg-white/15 text-white border-0 mb-3">
              <Icon name="bolt" className="text-[14px]" /> Today's deal
            </div>
            <h2 className="text-headline-lg font-bold leading-tight line-clamp-2">
              {Math.round(((topDeal.compareAtPriceCents - topDeal.priceCents) / topDeal.compareAtPriceCents) * 100)}% off · {topDeal.name}
            </h2>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-headline-md font-bold">${(topDeal.priceCents / 100).toFixed(2)}</span>
              <span className="text-label-md line-through opacity-80">${(topDeal.compareAtPriceCents / 100).toFixed(2)}</span>
            </div>
            <span className="mt-3 inline-block bg-white text-primary font-semibold px-4 py-2 rounded-full text-sm">
              Shop the deal
            </span>
          </div>
          <img
            src={(() => {
              try {
                const urls = typeof topDeal.imageUrls === 'string' ? JSON.parse(topDeal.imageUrls) : (topDeal.imageUrls || []);
                return urls[0] || '/seed-images/placeholder.svg';
              } catch { return '/seed-images/placeholder.svg'; }
            })()}
            alt=""
            loading="lazy"
            className="absolute right-0 top-0 h-full w-1/2 object-cover opacity-30"
            onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
          />
        </Link>
      ) : (
        <div className="card p-5 bg-gradient-to-br from-primary to-primary-container text-white relative overflow-hidden">
          <div className="relative z-10 max-w-[70%]">
            <h2 className="text-headline-lg font-bold leading-tight">Welcome to Yobou</h2>
            <p className="mt-2 text-label-md opacity-90">
              Shop from {all.length} product{all.length === 1 ? '' : 's'} across {CATS.length} categories.
            </p>
            <Link to="/categories" className="mt-4 inline-block bg-white text-primary font-semibold px-4 py-2 rounded-full text-sm">
              Browse all
            </Link>
          </div>
        </div>
      )}

      {/* Categories */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-headline-md font-bold">Categories</h2>
          <Link to="/categories" className="text-sm text-primary font-semibold flex items-center gap-0.5">
            See all <Icon name="chevron_right" className="text-[18px]" />
          </Link>
        </div>
        <div className="relative -mx-4">
          <div className="flex gap-2.5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory px-4 pb-1">
            {CATS.map((c) => (
              <Link
                key={c.name}
                to={`/categories/${encodeURIComponent(c.name)}`}
                className="snap-start flex flex-col items-center gap-2 min-w-[76px] max-w-[76px] group"
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm transition-transform group-active:scale-95 ${c.color}`}>
                  <Icon name={c.icon} className="text-[28px]" />
                </div>
                <span className="text-label-md text-center leading-tight line-clamp-2">{c.name}</span>
              </Link>
            ))}
          </div>
          {/* Right-edge fade hinting there is more to scroll */}
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" />
        </div>
      </section>

      {/* Deals rail — only when at least one product has a real discount. */}
      {dealCount > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-headline-md font-bold flex items-center gap-2">
              <Icon name="bolt" className="text-secondary" /> Deals
            </h2>
            <span className="text-label-md text-on-surface-variant">
              {dealCount} item{dealCount === 1 ? '' : 's'} on sale
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
            {deals.slice(0, 8).map((p) => (
              <div key={p.id} className="min-w-[170px] sm:min-w-[200px]">
                <ProductCard product={p} onAdd={quickAdd} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Flash deals rail — curated subset of products the admin/vendor
          flagged as `showOnFlashDeals`. Sits between Deals and Recently
          viewed so a handpicked promotion gets prominent placement
          without overwhelming the main grid. Empty state is hidden. */}
      {flashDeals.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-headline-md font-bold flex items-center gap-2">
              <Icon name="flash_on" className="text-tertiary" /> Flash deals
            </h2>
            <span className="text-label-md text-on-surface-variant">
              {flashDeals.length} pick{flashDeals.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
            {flashDeals.map((p) => (
              <div key={p.id} className="min-w-[170px] sm:min-w-[200px]">
                <ProductCard product={p} onAdd={quickAdd} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recommended */}

      {/* Recently viewed — localStorage-backed, hidden when empty. The
          rail only renders products that still exist in the public
          catalog; if a vendor removed one since the user last saw it,
          the card just doesn't show up. */}
      {recentIds.length > 0 && all.length > 0 && (() => {
        const byId = new Map(all.map((p) => [p.id, p]));
        const recent = recentIds
          .map((rid) => byId.get(rid))
          .filter(Boolean)
          .slice(0, 12);
        if (recent.length === 0) return null;
        return (
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-headline-md font-bold flex items-center gap-2">
                <Icon name="history" className="text-on-surface-variant" /> Recently viewed
              </h2>
              <button
                onClick={clearRecent}
                className="text-label-md text-on-surface-variant hover:text-primary"
                aria-label="Clear recently viewed"
              >
                Clear
              </button>
            </div>
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
              {recent.map((p) => (
                <div key={p.id} className="min-w-[170px] sm:min-w-[200px]">
                  <ProductCard product={p} onAdd={quickAdd} />
                </div>
              ))}
            </div>
          </section>
        );
      })()}

      {/* Recommended — full catalog grid. Lives below Recently viewed so
          shoppers who return to a product they were considering see it
          again before falling into the broader discovery loop. */}
      {all.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-headline-md font-bold">Recommended for you</h2>
            <span className="text-label-md text-on-surface-variant">{all.length} items</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {all.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={quickAdd} />
            ))}
          </div>
        </section>
      )}

      {!loading && all.length === 0 && !error && (
        <div className="text-center py-12 text-on-surface-variant">No products available right now.</div>
      )}
    </div>
  );
}
