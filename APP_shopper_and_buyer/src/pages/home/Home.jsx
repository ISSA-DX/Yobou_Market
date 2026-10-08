import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';
import { useApi, RetryError } from '../../useApi.jsx';
import { useProductLiveSync } from '../../lib/useProductLiveSync';
import { useRecentlyViewed } from '../../lib/useRecentlyViewed';
import { toast } from '../../lib/toast';
import HeroCarousel from './HeroCarousel';
import ProductRow from './ProductRow';
import OrderPeek from './OrderPeek';
import TrustStrip from '../../components/TrustStrip';
import PromoBanner from '../../components/PromoBanner';
import CountdownTimer from '../../components/CountdownTimer';

const CATS = [
  { name: 'Electronics', icon: 'devices', color: 'bg-blue-50 text-blue-600' },
  { name: 'Phones', icon: 'smartphone', color: 'bg-indigo-50 text-indigo-600' },
  { name: 'Fashion', icon: 'checkroom', color: 'bg-pink-50 text-pink-600' },
  { name: 'Shoes', icon: 'steps', color: 'bg-orange-50 text-orange-600' },
  { name: 'Beauty', icon: 'spa', color: 'bg-rose-50 text-rose-500' },
  { name: 'Home', icon: 'chair', color: 'bg-amber-50 text-amber-700' },
  { name: 'Gaming', icon: 'sports_esports', color: 'bg-violet-50 text-violet-600' },
  { name: 'Grocery', icon: 'local_grocery_store', color: 'bg-lime-50 text-lime-800' },
  { name: 'Sports', icon: 'sports_basketball', color: 'bg-green-50 text-green-600' },
  { name: 'Books', icon: 'menu_book', color: 'bg-emerald-50 text-emerald-700' },
  { name: 'Airtime & Bills', icon: 'phone_android', color: 'bg-cyan-50 text-cyan-700' },
];

const HERO_SLIDES = [
  {
    title: 'Up to 50% off electronics',
    subtitle: 'Limited-time deals on phones, laptops, and accessories.',
    cta: 'Shop the sale',
    to: '/categories/Electronics',
    gradient: 'from-primary to-primary-container',
    icon: 'devices',
    tag: 'Limited offer',
    tagIcon: 'bolt',
  },
  {
    title: 'Summer fashion refresh',
    subtitle: 'New arrivals in clothing, shoes, and accessories.',
    cta: 'Explore fashion',
    to: '/categories/Fashion',
    gradient: 'from-pink-500 to-rose-500',
    icon: 'checkroom',
    tag: 'New arrivals',
    tagIcon: 'new_releases',
  },
  {
    title: 'Free delivery on orders $50+',
    subtitle: 'Stock up on groceries, home, and everyday essentials.',
    cta: 'Start shopping',
    to: '/home',
    gradient: 'from-tertiary to-tertiary-container',
    icon: 'local_shipping',
    tag: 'Yobou perk',
    tagIcon: 'local_shipping',
  },
];

function timeGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useStore((s) => s.user);
  const refreshCart = useStore((s) => s.refreshCartCount);
  const [refreshing, setRefreshing] = useState(false);

  const {
    data: feedData,
    error: feedError,
    loading: feedLoading,
    refetch: refetchFeed,
  } = useApi('/api/products/feed');

  const {
    data: buyAgainData,
    loading: buyAgainLoading,
    refetch: refetchBuyAgain,
  } = useApi('/api/orders/buy-again');

  const {
    data: ordersData,
    loading: ordersLoading,
    refetch: refetchOrders,
  } = useApi('/api/orders?limit=1');

  const feed = feedData || {};
  const deals = feed.deals || [];
  const newArrivals = feed.newArrivals || [];
  const featured = feed.featured || [];
  const trending = feed.trending || [];
  const all = feed.all || [];
  const buyAgainProducts = buyAgainData?.products || [];
  const recentOrders = ordersData?.orders || [];

  useProductLiveSync(() => {
    refetchFeed();
    refetchBuyAgain();
    refetchOrders();
  });

  async function quickAdd(p) {
    try {
      await useStore.getState().ensureGuestSession();
      await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: 1 } });
      await refreshCart();
      toast.success(`Added ${p.name} to cart`);
    } catch (e) {
      navigate('/login', { state: { from: location } });
    }
  }

  async function refreshAll() {
    setRefreshing(true);
    try {
      await Promise.all([refetchFeed(), refetchBuyAgain(), refetchOrders()]);
    } finally {
      setRefreshing(false);
    }
  }

  const greeting = `${timeGreeting()}, ${user?.name?.split(' ')[0] || 'there'}`;
  const pageLoading = feedLoading && !feedData;

  return (
    <div className="px-4 pt-4 pb-6 space-y-6">
      {/* Greeting — first content below sticky header. */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-label-md text-on-surface-variant">{greeting} 👋</div>
          <h1 className="text-headline-lg font-bold leading-tight">What are you shopping for today?</h1>
        </div>
        <button
          type="button"
          onClick={refreshAll}
          disabled={refreshing}
          className="p-2 rounded-full bg-surface-low text-on-surface-variant hover:text-primary hover:bg-surface-high transition shrink-0 disabled:opacity-60"
          aria-label="Refresh home"
          title="Refresh home"
        >
          <Icon name="refresh" className={`text-[20px] ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {feedError && !feedData ? (
        <RetryError message="Couldn't load products." onRetry={refetchFeed} />
      ) : null}

      {/* Trust signals — placed high because they measurably reduce bounce
          on mobile storefronts (Jumia, AliExpress, Shopify best-practice). */}
      <TrustStrip />

      {/* Active order peek — only meaningful when orders exist. */}
      <OrderPeek orders={recentOrders} loading={ordersLoading} />

      {/* Hero carousel — static curated slides, never empty. */}
      <HeroCarousel slides={HERO_SLIDES} />

      {/* Category shortcuts — always render, skeleton when loading. */}
      <section className="relative -mx-4">
        <div className="px-4 flex items-center justify-between mb-3">
          <h2 className="text-headline-md font-bold">Categories</h2>
          <Link to="/categories" className="text-sm text-primary font-semibold flex items-center gap-0.5">
            See all <Icon name="chevron_right" className="text-[18px]" />
          </Link>
        </div>

        <div className="flex gap-2.5 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory px-4 pb-1 min-h-[96px]">
          {pageLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="snap-start flex flex-col items-center gap-2 min-w-[76px] max-w-[76px]">
                <div className="w-16 h-16 rounded-2xl bg-surface-low animate-pulse" />
                <div className="h-3 w-14 bg-surface-low rounded animate-pulse" />
              </div>
            ))
          ) : (
            CATS.map((c) => (
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
            ))
          )}
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" />
      </section>

      {/* Buy Again */}
      {(buyAgainProducts.length > 0 || buyAgainLoading) && (
        <ProductRow
          title="Buy Again"
          icon="replay"
          action="Reorder"
          actionTo="/orders"
          products={buyAgainProducts}
          loading={buyAgainLoading}
          onAdd={quickAdd}
          skeletonCount={3}
        />
      )}

      {/* App-exclusive coupon — urgency + retention (AliExpress / Temu pattern). */}
      <PromoBanner code="YOBAPP20" discount="20% off" />

      {/* Today's Deals */}
      {(deals.length > 0 || feedLoading) && (
        <ProductRow
          title={
            <span className="flex items-center gap-2">
              Today's Deals
              <CountdownTimer />
            </span>
          }
          icon="bolt"
          action="All deals"
          actionTo="/search?q=deals"
          products={deals}
          loading={feedLoading}
          onAdd={quickAdd}
          skeletonCount={4}
        />
      )}

      {/* New Arrivals */}
      <ProductRow
        title="New Arrivals"
        icon="new_releases"
        action="Explore"
        actionTo="/search?q=new"
        products={newArrivals}
        loading={feedLoading}
        onAdd={quickAdd}
        badge="New"
        skeletonCount={4}
      />

      {/* Trending now — real best sellers surfaced from order data. */}
      {(trending.length > 0 || feedLoading) && (
        <ProductRow
          title="Trending now"
          icon="trending_up"
          action="Browse"
          actionTo="/categories"
          products={trending}
          loading={feedLoading}
          onAdd={quickAdd}
          skeletonCount={4}
        />
      )}

      {/* Featured Picks */}
      {(featured.length > 0 || feedLoading) && (
        <ProductRow
          title="Featured Picks"
          icon="emoji_events"
          action="See all"
          actionTo="/categories"
          products={featured}
          loading={feedLoading}
          onAdd={quickAdd}
          badge="Popular"
          skeletonCount={4}
        />
      )}

      {/* Recommended grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-headline-md font-bold">Recommended for you</h2>
          {!feedLoading && <span className="text-label-md text-on-surface-variant">{all.length} items</span>}
        </div>

        {feedLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
          </div>
        ) : null}

        {!feedLoading && all.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {all.map((p) => (
              <ProductCard key={p.id} product={p} onAdd={quickAdd} />
            ))}
          </div>
        )}

        {!feedLoading && all.length === 0 && !feedError && (
          <div className="text-center py-12 px-4 card">
            <div className="w-16 h-16 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-3">
              <Icon name="shopping_bag" className="text-[28px] text-on-surface-variant" />
            </div>
            <p className="font-medium text-on-surface">No products available right now.</p>
            <p className="text-sm text-on-surface-variant mt-1">Check back soon — new arrivals land every day.</p>
          </div>
        )}
      </section>

      {/* Footer helpers */}
      <footer className="pt-6 pb-2 space-y-4">
        <hr className="border-outline-variant/30" />
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="w-full py-2.5 rounded-md bg-surface-high text-on-surface font-semibold text-sm hover:bg-surface-highest transition active:scale-[0.99]"
        >
          <span className="inline-flex items-center gap-1.5">
            <Icon name="arrow_upward" className="text-[18px]" /> Back to top
          </span>
        </button>
        <div className="text-center space-y-1 text-sm text-on-surface-variant">
          <p>Thanks for shopping with <span className="font-semibold text-on-surface">Yobou</span>.</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link to="/help" className="hover:text-primary transition">Help</Link>
            <Link to="/orders" className="hover:text-primary transition">Your Orders</Link>
            <Link to="/profile" className="hover:text-primary transition">Account</Link>
          </div>
          <p className="text-label-md">© {new Date().getFullYear()} Yobou Market</p>
        </div>
      </footer>
    </div>
  );
}
