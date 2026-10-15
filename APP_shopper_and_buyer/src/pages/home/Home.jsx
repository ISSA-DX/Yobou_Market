import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard from '../../components/ProductCard';
import AutoCarousel from '../../components/AutoCarousel';
import { useApi, RetryError } from '../../useApi.jsx';
import { useNotifications } from '../../lib/useNotifications';
import { useProductLiveSync } from '../../lib/useProductLiveSync';
import { useRecentlyViewed } from '../../lib/useRecentlyViewed';
import { toast } from '../../lib/toast';
import { themeFor, categoryPath } from '../../lib/categoryTheme';

// Shown until /api/products/categories answers, so the rail never
// renders empty. Names match the curated Category table.
const FALLBACK_CATS = [
  { name: 'Electronics', icon: 'devices' }, { name: 'Phones', icon: 'smartphone' },
  { name: 'Computer', icon: 'computer' }, { name: 'Fashion', icon: 'checkroom' },
  { name: 'Shoes', icon: 'steps' }, { name: 'Beauty', icon: 'spa' },
  { name: 'Home', icon: 'chair' }, { name: 'Kitchen', icon: 'blender' },
  { name: 'Sports', icon: 'sports_basketball' }, { name: 'Fitness', icon: 'fitness_center' },
  { name: 'Toys', icon: 'toys' }, { name: 'Gaming', icon: 'sports_esports' },
];

export default function Home() {
  const catsApi = useApi('/api/products/categories');
  // Featured categories lead, then the curated order.
  const homeCats = catsApi.data?.categories?.length
    ? [...catsApi.data.categories].sort((a, b) => Number(b.featured) - Number(a.featured))
    : FALLBACK_CATS;
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore((s) => s.user);
  const { unreadCount } = useNotifications(10);
  const cartCount = useStore((s) => s.cartCount);
  const [q, setQ] = useState('');
  const { data, error, loading, refetch } = useApi('/api/products');
  // Live sync — Home page refetches when any product is created/updated/deleted.
  useProductLiveSync(refetch);
  // Recently viewed rail — guest-friendly via localStorage.
  const { ids: recentIds, clear: clearRecent } = useRecentlyViewed();

  const all = data?.products || [];
  // Featured — top 12 newest in-stock products for the auto-rotating
  // carousel. Excludes out-of-stock so the carousel never leads with
  // a card the shopper can't actually buy. Recency first because the
  // server's default sort is createdAt desc.
  const featuredProducts = useMemo(() => {
    return all
      .filter((p) => p.stock > 0 && p.status === 'LIVE')
      .sort((a, b) => {
        const ta = new Date(a.createdAt || 0).getTime();
        const tb = new Date(b.createdAt || 0).getTime();
        return tb - ta;
      })
      .slice(0, 12);
  }, [all]);
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

  // Curated rails fetched straight from the server (not derived from the
  // first page of the catalogue), so a flagged product always shows up.
  // Placement flags are set per product by admins / sellers.
  const recentDealsApi = useApi('/api/products?showOnRecentDeals=true&inStock=true&sort=newest&pageSize=10');
  const newArrivalsApi = useApi('/api/products?showOnNewArrivals=true&inStock=true&sort=newest&pageSize=10');
  useProductLiveSync(recentDealsApi.refetch);
  useProductLiveSync(newArrivalsApi.refetch);
  const recentDeals = recentDealsApi.data?.products || [];
  const newArrivals = newArrivalsApi.data?.products || [];

  async function quickAdd(p) {
    try {
      await useStore.getState().ensureGuestSession();
      await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: 1 } });
      await useStore.getState().refreshCartCount();
      // v0.3.16: no longer navigate to /cart. The cart-badge in
      // MobileShell updates via refreshCartCount() above, the toast
      // confirms the add, and the ProductCard flips to "Added" for
      // 3s. The user stays on Home so they can keep browsing. Cart
      // navigation is reserved for an explicit tap on the cart icon.
      toast.addedToCart(p);
    } catch (e) {
      toast.error(e?.data?.error || 'Could not add to cart');
    }
  }

  return (
    <div className="pb-6">
      {/* App header — brand, notifications, cart and a search field that
          stays pinned while the shopper scrolls the feed. */}
      <header className="sticky top-0 z-20 glass border-b border-outline-variant/40 px-4 pt-3 pb-3">
        <div className="flex items-center justify-between">
          <Link to="/home" className="flex items-center gap-2" aria-label="Yobou home">
            <div className="w-9 h-9 rounded-md bg-gradient-to-br from-primary-container to-primary text-white flex items-center justify-center font-black text-lg shadow-pop">Y</div>
            <div className="leading-tight">
              <div className="font-extrabold text-lg tracking-tight text-on-surface">Yobou</div>
              <div className="text-label-sm font-medium text-on-surface-variant">Hi, {user?.name && user.name !== 'Guest' ? user.name.split(' ')[0] : 'there'} 👋</div>
            </div>
          </Link>
          <div className="flex items-center gap-1">
            <HeaderIcon to="/notifications" icon="notifications" label="Notifications" count={unreadCount} />
            <HeaderIcon to="/cart" icon="shopping_bag" label="Cart" count={cartCount} />
          </div>
        </div>
        <form
          className="mt-3 relative"
          onSubmit={(e) => { e.preventDefault(); navigate(`/search?q=${encodeURIComponent(q)}`); }}
          role="search"
        >
          <Icon name="search" className="absolute left-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
          <input
            className="input rounded-full pl-11 pr-12 py-2.5 bg-surface-low border-transparent shadow-none focus:bg-white"
            placeholder="Search products, brands and categories"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            enterKeyHint="search"
          />
          <button type="submit" className="absolute right-1.5 top-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-primary text-white flex items-center justify-center" aria-label="Search">
            <Icon name="arrow_forward" className="text-[18px]" />
          </button>
        </form>
      </header>

      <div className="px-4 pt-4 space-y-7">
      {error && !data ? (
        <RetryError message="Couldn't load products." onRetry={refetch} />
      ) : null}

      {/* Category shortcuts — the fastest path into the catalogue. */}
      <nav aria-label="Categories" className="-mx-4">
        <div className="reveal-stagger stagger-pop flex gap-3 overflow-x-auto no-scrollbar snap-x scroll-px-4 px-4" style={{ "--stagger-step": "45ms" }}>
          {homeCats.slice(0, 12).map((c) => (
            <Link
              key={c.name}
              to={categoryPath(c)}
              className="snap-start flex flex-col items-center gap-1.5 w-[68px] shrink-0 group"
            >
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center ring-1 ring-black/5 transition-transform group-active:scale-95 ${themeFor(c).tile}`}>
                <Icon name={themeFor(c).icon} className="text-[26px]" />
              </div>
              <span className="block text-label-md font-medium text-center leading-tight truncate w-full">{c.name}</span>
            </Link>
          ))}
          <Link to="/categories" className="snap-start flex flex-col items-center gap-1.5 w-[68px] shrink-0">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white ring-1 ring-outline-variant text-primary">
              <Icon name="apps" className="text-[26px]" />
            </div>
            <span className="text-label-md font-semibold text-primary">All</span>
          </Link>
        </div>
      </nav>

      {/* Hero banner — data-driven when a real deal exists, otherwise a
          neutral on-brand welcome card. Renders nothing misleading. */}
      {topDeal ? (
        <Link
          to={`/product/${topDeal.id}`}
          className="reveal reveal-zoom anim-shine relative block overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-[#0a2a8f] via-primary to-primary-container shadow-pop"
        >
          <HeroDecor />
          <div className="relative z-10 flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 text-label-sm font-bold uppercase tracking-wide">
                <Icon name="bolt" className="text-[14px]" fill /> Today's deal
              </span>
              {/* text-white: overrides the global h2 colour on the gradient. */}
              <h2 className="mt-2 text-headline-md font-extrabold leading-snug line-clamp-2 text-white">{topDeal.name}</h2>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-headline-lg font-extrabold">${(topDeal.priceCents / 100).toFixed(2)}</span>
                <span className="text-label-md line-through opacity-75">${(topDeal.compareAtPriceCents / 100).toFixed(2)}</span>
                <span className="px-1.5 py-0.5 rounded bg-secondary text-on-secondary text-label-sm font-black">
                  -{Math.round(((topDeal.compareAtPriceCents - topDeal.priceCents) / topDeal.compareAtPriceCents) * 100)}%
                </span>
              </div>
              <span className="mt-4 inline-flex items-center gap-1 bg-white text-primary font-bold px-4 py-2 rounded-full text-sm shadow-card">
                Shop the deal <Icon name="arrow_forward" className="text-[16px]" />
              </span>
            </div>
            <div className="anim-float w-28 h-28 shrink-0 rounded-xl bg-white/95 p-1.5 shadow-float rotate-3">
              <img
                src={(() => {
                  try {
                    const urls = typeof topDeal.imageUrls === 'string' ? JSON.parse(topDeal.imageUrls) : (topDeal.imageUrls || []);
                    return urls[0] || '/seed-images/placeholder.svg';
                  } catch { return '/seed-images/placeholder.svg'; }
                })()}
                alt=""
                loading="lazy"
                className="w-full h-full object-cover rounded-lg"
                onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }}
              />
            </div>
          </div>
        </Link>
      ) : (
        <div className="reveal reveal-zoom anim-shine relative overflow-hidden rounded-2xl p-5 text-white bg-gradient-to-br from-[#0a2a8f] via-primary to-primary-container shadow-pop">
          <HeroDecor />
          <div className="relative z-10 max-w-[78%]">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white/15 text-label-sm font-bold uppercase tracking-wide">
              <Icon name="storefront" className="text-[14px]" /> Welcome to Yobou
            </span>
            {/* text-white: overrides the global h2 colour on the gradient. */}
            <h2 className="mt-2 text-headline-lg font-extrabold leading-tight text-white">Everything you love, delivered to your door</h2>
            <p className="mt-1.5 text-label-md opacity-90">
              {all.length} product{all.length === 1 ? '' : 's'} from trusted local stores.
            </p>
            <Link to="/categories" className="mt-4 inline-flex items-center gap-1 bg-white text-primary font-bold px-4 py-2 rounded-full text-sm shadow-card">
              Start shopping <Icon name="arrow_forward" className="text-[16px]" />
            </Link>
          </div>
        </div>
      )}

      {/* Trust strip — the promises that matter in this market. */}
      <div className="reveal-stagger stagger-up grid grid-cols-3 gap-2" style={{ "--stagger-step": "90ms" }}>
        {[
          ['local_shipping', 'Free delivery', 'over $50'],
          ['payments', 'Pay on delivery', 'cash accepted'],
          ['verified_user', '15-day returns', 'easy refunds'],
        ].map(([icon, title, sub]) => (
          <div key={title} className="card px-2.5 py-3 flex flex-col items-center text-center gap-1">
            <Icon name={icon} className="text-primary text-[22px]" />
            <div className="text-label-md font-bold leading-tight">{title}</div>
            <div className="text-label-sm font-medium text-on-surface-variant">{sub}</div>
          </div>
        ))}
      </div>

      {/* Featured — auto-rotating carousel (Amazon deal-of-the-day pattern).
          Renders nothing if the catalog has fewer than 2 in-stock items
          so a one-product pilot doesn't show a stranded carousel chrome. */}
      {featuredProducts.length >= 2 && (
        <section className="reveal reveal-blur">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title flex items-center gap-2">
              <Icon name="auto_awesome" className="text-secondary" /> Featured for you
            </h2>
            <span className="text-label-md text-on-surface-variant flex items-center gap-1">
              <Icon name="swipe" className="text-[14px]" /> Swipe
            </span>
          </div>
          <AutoCarousel interval={4000} ariaLabel="Featured products — auto-rotating carousel">
            {featuredProducts.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={quickAdd} />
            ))}
          </AutoCarousel>
        </section>
      )}

      {/* Deals rail — only when at least one product has a real discount. */}
      {dealCount > 0 && (
        <section className="reveal reveal-fade-up">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title flex items-center gap-2">
              <Icon name="bolt" className="text-secondary" /> Deals
            </h2>
            <span className="text-label-md text-on-surface-variant">
              {dealCount} item{dealCount === 1 ? '' : 's'} on sale
            </span>
          </div>
          <div className="reveal-stagger stagger-left flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
            {deals.slice(0, 8).map((p) => (
              <div key={p.id} className="min-w-[170px] sm:min-w-[200px]">
                <ProductCard product={p} onAdd={quickAdd} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Recent deals — curated by admins/sellers (Product.showOnRecentDeals),
          newest first. Warm band so it reads as a promotion. */}
      {recentDeals.length > 0 && (
        <section className="reveal reveal-tilt -mx-4 px-4 py-4 bg-gradient-to-br from-rose-50 via-orange-50 to-amber-50 border-y border-rose-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title flex items-center gap-2">
              <span className="w-8 h-8 rounded-full bg-sale text-white flex items-center justify-center">
                <Icon name="local_offer" className="text-[18px]" fill />
              </span>
              Recent deals
            </h2>
            <Link to="/search?showOnRecentDeals=true&sort=newest" className="text-sm font-semibold text-sale flex items-center">
              See all <Icon name="chevron_right" className="text-[18px]" />
            </Link>
          </div>
          <div className="reveal-stagger stagger-pop flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1">
            {recentDeals.map((p) => (
              <div key={p.id} className="min-w-[170px] sm:min-w-[200px]">
                <ProductCard product={p} onAdd={quickAdd} />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* New arrivals — Product.showOnNewArrivals (on by default for new
          products), newest first. */}
      {newArrivals.length > 0 && (
        <section className="reveal reveal-fade-up">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="section-title flex items-center gap-2">
                <Icon name="new_releases" className="text-primary" fill /> New arrivals
              </h2>
              <p className="text-label-md text-on-surface-variant mt-0.5">Just landed from our stores</p>
            </div>
            <Link to="/search?showOnNewArrivals=true&sort=newest" className="text-sm font-semibold text-primary flex items-center">
              See all <Icon name="chevron_right" className="text-[18px]" />
            </Link>
          </div>
          <div className="reveal-stagger stagger-zoom grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {newArrivals.slice(0, 4).map((p) => (
              <div key={p.id} className="relative">
                <span className="absolute z-10 -top-1.5 left-2 px-2 py-0.5 rounded-full bg-primary text-white text-label-sm font-black tracking-wide shadow-pop">
                  NEW
                </span>
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
        <section className="reveal reveal-wipe">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title flex items-center gap-2">
              <Icon name="flash_on" className="text-tertiary" /> Flash deals
            </h2>
            <span className="text-label-md text-on-surface-variant">
              {flashDeals.length} pick{flashDeals.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="reveal-stagger stagger-zoom flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4">
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
          <section className="reveal reveal-slide-right">
            <div className="flex items-center justify-between mb-3">
              <h2 className="section-title flex items-center gap-2">
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
        <section className="reveal reveal-fade-up">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title">Recommended for you</h2>
            <span className="text-label-md text-on-surface-variant">{all.length} items</span>
          </div>
          <div className="reveal-stagger stagger-flip grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
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
    </div>
  );
}

function HeaderIcon({ to, icon, label, count }) {
  return (
    <Link to={to} className="relative w-10 h-10 rounded-full flex items-center justify-center hover:bg-surface-high" aria-label={`${label}${count ? ` (${count})` : ''}`}>
      <Icon name={icon} className="text-[24px] text-on-surface" />
      {count > 0 && (
        <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-sale text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}

// Soft decorative shapes behind the hero copy.
function HeroDecor() {
  return (
    <>
      <div className="pointer-events-none absolute -right-10 -top-12 w-44 h-44 rounded-full bg-white/10" />
      <div className="pointer-events-none absolute right-16 -bottom-16 w-36 h-36 rounded-full bg-secondary/20 blur-xl" />
    </>
  );
}
