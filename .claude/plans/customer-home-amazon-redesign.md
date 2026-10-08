# Customer Home Page — Amazon-Style Redesign Plan

## Goal
Redesign the logged-in customer home page (`/home`) in `APP_shopper_and_buyer` so it feels as friendly, fast, and discovery-driven as the Amazon mobile app, while adding features that improve real business operations (reordering, delivery awareness, quick search, deals, order status).

The design must be **mobile-first**, fully responsive, and reuse the existing Tailwind token system (`primary`, `surface`, `secondary`, etc.). All changes stay within the current React + Vite + Capacitor stack — no new runtime dependencies.

## Research Summary

### What Amazon mobile does well (2024 redesign)
- **Sticky top bar** with delivery location, pill-shaped search, cart, and account.
- **Window Display / hero carousel** with large personalized promo cards at the top.
- **Horizontal scroll rows** for deals, best-sellers, new releases, and recommendations.
- **"Buy Again" hub** for one-tap reordering of previously purchased items.
- **Grouped product collections** based on interests / recent browsing.
- **Rich product cards** with badges (discount %, best seller, free delivery), star ratings, and clear CTAs.
- **Bottom tab bar** for Home / Categories / Cart / Orders / Account.
- **Back-to-top**, help shortcuts, and clear section headers.

Sources:
- [Amazon’s redesigned homepage makes shopping easier and more personalized](https://www.aboutamazon.com/news/retail/amazon-homepage-redesign-features)
- [It’s not just you: Amazon’s shopping app is trying a different look](https://www.theverge.com/2024/10/22/24276973/amazon-shopping-app-homepage-redesign-ui-update)
- [Amazon app entices shoppers with a more personalized experience](https://www.androidauthority.com/amazon-shopping-app-redesign-3493309/)

### Current Yobou customer page state
- File: `APP_shopper_and_buyer/src/pages/home/Home.jsx`
- Existing sections: greeting, search, single hero banner, category chips, "Flash Deals" (first 4 products), "Recommended for you" (full grid).
- Existing `MobileShell` has a minimal sticky header (brand + notifications) and a 5-tab bottom nav.
- Product cards already support wishlist, compare-at pricing, and a delivery message.
- Backend already exposes `/api/products`, `/api/products/categories`, `/api/orders`, `/api/cart`, and live SSE product/order events.
- No dedicated home-feed endpoint exists, so the page currently loads all products and slices them in the frontend.

## Proposed Redesign

### A. Header / MobileShell redesign (Amazon-style sticky top bar)
1. **Delivery location pill**
   - Show user's default city/neighborhood and a tap target to choose / manage addresses.
   - Uses existing `/api/addresses` and store user data.
2. **Pill-shaped search bar**
   - Wider, rounded, integrated into the header.
   - Keep the existing search page link; add a microphone/camera placeholder icon for visual parity.
3. **Cart icon with count**
   - Already in bottom nav; also surface a cart icon in the top-right for faster access.
4. **Friendly greeting**
   - "Good morning, [First Name]" + a personalized subline.

### B. Home feed sections (top to bottom)
1. **Hero carousel** (replaces single banner)
   - 3–4 swipeable promo cards with auto-advance and manual dots.
   - Cards reuse the existing gradient-card style and link to categories/deals.
2. **Category shortcuts**
   - Keep the horizontal scroll, but make chips larger and tappable with clearer active states.
3. **Buy Again / Quick Reorder**
   - New backend endpoint `GET /api/orders/buy-again` returns the 10 most recently ordered products with last order metadata.
   - Horizontal scroll of compact product cards with a one-tap "Reorder" button that adds qty 1 to cart and shows a toast.
4. **Today's Deals**
   - Products with `compareAtPriceCents > priceCents`.
   - Show discount percentage badge and a countdown-style "Ends soon" chip.
5. **New Arrivals**
   - Most recently created LIVE products, capped to a carousel.
6. **Recommended for you**
   - Remaining products in a responsive 2-column grid (current behavior, but with enhanced cards).
7. **Order status peek**
   - If the user has a recent non-delivered order, show a small "Your order is on the way" card that links to tracking.
8. **Footer helper bar**
   - Back-to-top button, Help / Customer Service link, friendly "Thanks for shopping with Yobou" close-out.

### C. ProductCard enhancements
- Add visual badges:
  - Discount percentage (when `compareAtPriceCents` is higher).
  - "Best seller" / "Popular" badge on products with the highest relative stock turnover proxy.
  - "Free delivery" badge when `priceCents >= 5000`.
- Improve rating display (still mocked at 4★ until real reviews are added, but visually richer).
- Better tap targets and skeleton state.

### D. Backend additions (lightweight, no schema changes)
1. **`GET /api/orders/buy-again`** (`server/src/routes/orders.js`)
   - Auth-only.
   - Returns distinct products from the user's last 3 delivered/placed orders, newest first, with `lastOrderedAt`, `lastQuantity`, and parsed image URLs.
2. **`GET /api/products/feed`** (`server/src/routes/products.js`)
   - Public or auth-optional.
   - Returns pre-curated slices in one round-trip:
     - `deals` — discounted LIVE products, limit 10.
     - `newArrivals` — newest LIVE products, limit 10.
     - `featured` — hand-picked featured categories or top products, limit 10.
     - `all` — remaining LIVE products for the grid.
   - Reduces frontend computation and enables skeleton-to-content transition.

### E. UX / business-operation improvements
- **One-tap reorder** from home feed.
- **Search-as-you-type suggestions** page polish (optional, only if time allows).
- **Pull-to-refresh** feel: `useApi` already supports `refetch`; wire a visible refresh button on the home header.
- **Live updates**: keep existing SSE hooks so new products/deals appear without manual refresh.
- **Empty-state guidance**: if a section has no data, show a friendly fallback instead of blank space.

## Files to Modify

### Frontend
- `APP_shopper_and_buyer/src/pages/home/Home.jsx` — complete feed layout rewrite.
- `APP_shopper_and_buyer/src/components/MobileShell.jsx` — Amazon-style sticky header.
- `APP_shopper_and_buyer/src/components/ProductCard.jsx` — badges, layout tweaks.
- `APP_shopper_and_buyer/src/styles/index.css` — carousel dots, pill search, section spacing utilities.
- `APP_shopper_and_buyer/src/pages/home/Search.jsx` — minor header polish to match new top bar.

### Backend
- `server/src/routes/orders.js` — add `/buy-again` endpoint.
- `server/src/routes/products.js` — add `/feed` endpoint.
- `server/src/index.js` — register new routes if needed (both should already be mounted under `/api/orders` and `/api/products`).

### Optional / later
- `Web_Version_APP/vite.config.js` and `package.json` — no changes needed; it already aliases `APP_shopper_and_buyer/src`.

## Implementation Order

1. **Backend feed endpoints**
   - Implement `/api/products/feed` and `/api/orders/buy-again`.
   - Verify with curl / seeded demo data.
2. **Header / MobileShell redesign**
   - Update sticky header with location, pill search, cart, greeting.
3. **Home page sections**
   - Refactor `Home.jsx` to load from `/api/products/feed` and `/api/orders/buy-again`.
   - Add HeroCarousel, ProductRow, BuyAgainRow, OrderPeekCard components inline or as small files in `src/pages/home/`.
4. **ProductCard badges**
   - Add discount/free-delivery/bestseller badges.
5. **CSS polish**
   - Add carousel dots, pill search, section title, back-to-top styles.
6. **Cross-page consistency**
   - Update `Search.jsx` header to match new top-bar style.
7. **Verification**
   - `npm run build` in `APP_shopper_and_buyer`.
   - `npm run dev` smoke test with seeded accounts.
   - Check mobile viewport (375px) and desktop (1280px).

## Verification Steps

1. Backend:
   - `GET /api/products/feed` returns `deals`, `newArrivals`, `featured`, `all`.
   - `GET /api/orders/buy-again` returns previously ordered products for logged-in shopper.
2. Frontend build:
   - `cd APP_shopper_and_buyer && npm run build` completes with no errors.
3. Visual checks:
   - Header is sticky, shows location/search/cart.
   - Hero carousel swipes and auto-advances.
   - Buy Again appears only when the user has orders.
   - Deals show discount badges.
   - Bottom nav remains functional.
   - Pull / tap refresh updates sections.
4. Business flows:
   - Reorder button adds to cart and updates cart count.
   - Order peek links to tracking.
   - Search navigates to `/search`.
   - Cart count updates in both top header and bottom nav.

## Scope Boundaries
- No Prisma schema changes.
- No new npm dependencies.
- No changes to vendor or admin portals.
- No changes to checkout flow, payment, or auth.
- Ratings remain visually mocked (real review system is a future feature).

## Success Criteria
The customer home page should feel like a modern e-commerce discovery surface: visually layered, fast to scan, thumb-friendly, and operationally useful for repeat purchases and deal browsing.
