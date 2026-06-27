# Yobou Full-Stack Audit & Fix Plan

## Goal
Get the Yobou web + Capacitor mobile app fully functional and deployment-ready by fixing all critical/high bugs in the backend, frontend, and mobile configuration, then verifying every page works end-to-end.

## Current State
- **Stack:** Express + Prisma (SQLite) backend, Vite + React + Tailwind frontend, Capacitor Android wrapper.
- **Build:** Client builds successfully; server starts successfully.
- **Tests:** No tests exist; `npm test` fails because `server/tests/` is missing.
- **Runtime port 4000** was held by an orphaned process during earlier runs; this is environmental, not a code bug.

## Critical Backend Bugs (must fix first)

1. **Prisma relation missing for `Order.addressId`**
   - `orders.js` does `include: { address: true }` but schema has no relation. Fix `schema.prisma` by adding `address Address @relation(fields: [addressId], references: [id])` and `orders Order[]` on `Address`, then re-run `db:push`.

2. **`GET /api/products/vendor/mine` shadowed by `/:id`**
   - Move `/vendor/mine` route above `/:id` in `server/src/routes/products.js`.

3. **Order creation lacks stock/address validation**
   - Verify address belongs to current user.
   - Check stock before placing order and decrement stock in a Prisma `$transaction`.
   - Prevent overselling.

4. **Order status update lacks state machine and role checks**
   - Vendors may only move `PAID → PROCESSING → SHIPPED` for items they own; admins may move any non-terminal state; `DELIVERED`/`CANCELLED` cannot be left.
   - Block pending/rejected vendors from product edits.

5. **Product `imageUrls` returned as JSON string**
   - Either change schema field to `Json` or parse before sending; ensure frontend receives an array.

6. **JWT fallbacks use static secrets**
   - Throw at startup if secrets are missing in production; keep dev-only fallback only when `NODE_ENV !== 'production'`.

7. **Global error handler leaks `err.message`**
   - Return generic `INTERNAL` in production; log full server-side.

8. **No tests**
   - Add `server/tests/auth.test.js`, `server/tests/products.test.js`, `server/tests/orders.test.js` covering the critical paths.

## Critical Frontend Bugs

1. **Checkout routes render blank**
   - `TransactionLayout` is used as a layout route but does not render `<Outlet />`. Add `<Outlet />` fallback so `/checkout/*` pages render.

2. **Vendor product creation crashes**
   - `VendorProductNew.jsx` uses `Link` without importing it. Add the import.

3. **Missing customer registration route**
   - Login's "Sign up" link points to `/login`. Create `/register` page/component or repurpose the existing customer registration logic; wire it in `App.jsx`.

4. **Login redirect after auth broken**
   - `Login.jsx` treats `location.state.from` as a string but it is a `location` object. Use `from.pathname`.

5. **Live order tracking does not update UI**
   - `TrackOrder.jsx` polling discards the API result. Use `refetch()` or update local state.

6. **Admin/vendor pages crash on API errors**
   - `AdminVendorApprovals.jsx`, `AdminOrders.jsx` need try/catch + retry UI.

7. **Dead routes**
   - `/search`, `/help`, `/admin/customers` are referenced but not implemented. Either implement or remove/hide links.

8. **Wishlist button on product details is not wired**
   - Connect to `toggleWishlist` / `isWishlisted`.

9. **Vendor registration does not send `categories`**
   - Include `categories` in the POST body if backend supports it.

## Mobile / Deployment Readiness

1. **Capacitor config**
   - Add `server.url` for live reload, iOS block, and required plugins (keyboard/safe-area).
   - Decide on `cleartext` policy for dev.

2. **Vite dev server host**
   - Add `host: true` to `vite.config.js` for LAN/mobile testing.

3. **Favicon missing**
   - `public/favicon.svg` is referenced but missing; add one or remove link.

4. **Viewport accessibility**
   - Remove `maximum-scale=1, user-scalable=no` from `index.html`.

5. **Production single-deploy**
   - Verify `client/dist` serving logic in `server/src/index.js` works after build.

## Verification Steps

1. `npm run db:push` and `npm run seed` succeed.
2. `npm run test --workspace server` passes new tests.
3. `npm run build --workspace client` succeeds.
4. `npm run dev` starts both server and client cleanly (port 4000 free).
5. Walk through every public page and authenticated portal:
   - Onboarding, Login, Register, Home, Categories, CategoryDetail, ProductDetails, Cart, Checkout (shipping/payment/card/success), Orders, TrackOrder, Profile.
   - Vendor: register, dashboard, products, add product.
   - Admin: dashboard, products, add product, vendor approvals, orders.
6. Smoke-test API endpoints with seeded demo accounts.
7. Confirm Capacitor Android sync/build commands are documented/working.

## Implementation Order

1. Backend schema + Prisma migration.
2. Backend route fixes (products, orders, cart, vendors, auth).
3. Add backend tests.
4. Frontend critical fixes (App.jsx, TransactionLayout, VendorProductNew, Login, TrackOrder, error handling).
5. Frontend feature completion (register, search/help route decisions, wishlist).
6. Mobile/deployment polish (Capacitor, Vite host, favicon, viewport).
7. End-to-end verification and final build.
