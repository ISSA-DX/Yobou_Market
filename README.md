# Yobou Market

A multi-portal e-commerce platform with three role-segregated portals — **Customer**, **Vendor**, and **Admin** — built around a single Express + Prisma API and a Vite + React frontend.

> Design references live in the original `*/code.html` mockup folders and the design system spec at `premium_commerce_collective/DESIGN.md`. The React app implements the same visual language using the design tokens directly in Tailwind config.

---

## Stack

| Layer    | Technology                                              |
| -------- | ------------------------------------------------------- |
| Frontend | Vite 5 · React 18 · react-router-dom 6 · Zustand · Tailwind 3 |
| Backend  | Node 20+ · Express 4 · Prisma 5                         |
| Database | SQLite (dev, file-based) / PostgreSQL (prod)            |
| Auth     | JWT (access + refresh) · bcrypt                         |
| Payments | Simulated (card / PayPal / COD) — single file to swap for real Stripe/PayPal later |
| Uploads  | Local filesystem (multer, served from `/uploads`)       |

---

## Prerequisites

- **Node.js 20+** (only hard requirement)
- npm 10+ (bundled with Node 20)

Postgres is **not** required for development — the app uses SQLite. For production, you'll want Postgres (see [Switching to Postgres](#switching-to-postgres)).

---

## One-command dev

```bash
# from the repo root
cp .env.example .env              # in repo root — used by the server
cd server && npm install && cd ..
cd APP_shopper_and_buyer && npm install && cd ..
cd Internal_Web_Admin && npm install && cd ..
cd Web_Version_APP && npm install && cd ..

# initialize the DB + seed demo data
npm run db:push                   # creates server/prisma/dev.db
npm run seed                      # adds demo admin / vendor / customer

# start both server (4000) and shopper (5173) concurrently
npm run dev
# or run the admin web app instead / alongside
npm run dev:admin                 # server + admin web (5174)
npm run dev:web                   # server + browser-only shopper build (5175)
npm run dev:all                   # everything at once
```

Open <http://localhost:5173>.

### Demo accounts (after `npm run seed`)

| Role     | Email                  | Password    | Notes                            |
| -------- | ---------------------- | ----------- | -------------------------------- |
| Admin    | `admin@yobou.test`     | `Admin123!` | Full admin access                |
| Vendor   | `vendor1@yobou.test`   | `Vendor123!`| Approved; can list products       |
| Vendor   | `vendor2@yobou.test`   | `Vendor123!`| **Pending approval**             |
| Courier  | `driver@yobou.test`    | `Driver123!`| Signs in to the Partner app → `/courier` |
| Customer | `shopper@yobou.test`   | `Shopper123!` | Pre-loaded cart + 2 sample orders |

---

## Project layout

```
Yobou/
├── server/                       # Express + Prisma API
│   ├── prisma/
│   │   ├── schema.prisma         # data model (User / Vendor / Product / Order / …)
│   │   └── seed.js               # idempotent demo seed
│   └── src/
│       ├── index.js              # express bootstrap, CORS, static /uploads
│       ├── prisma.js             # singleton PrismaClient
│       ├── auth/
│       │   ├── jwt.js            # sign/verify access + refresh
│       │   ├── middleware.js     # requireAuth, requireRole, requireApprovedVendor
│       │   └── routes.js         # /api/auth/{register,login,refresh,logout,me}
│       ├── lib/
│       │   ├── paymentSimulator.js   # swap this file for real Stripe/PayPal
│       │   └── validators.js     # zod schemas
│       └── routes/               # products / cart / orders / vendors / addresses / admin
├── APP_shopper_and_buyer/        # Shopper Android APK (Capacitor) — also the web SPA source
│   ├── android/                  # Gradle / Capacitor Android project
│   ├── capacitor.config.json     # appId, splash, status bar
│   ├── vite.config.js
│   └── src/                      # React app (App.jsx, api.js, store.js, components/, pages/)
├── Web_Version_APP/              # Browser-only build of the shopper app (no Capacitor)
│   ├── vite.config.js            # imports ../APP_shopper_and_buyer/src via alias
│   └── package.json
└── Internal_Web_Admin/           # Standalone admin web app (email/password only)
    ├── vite.config.js
    └── src/                      # Admin App.jsx, AdminShell, admin pages
```

---

## How the three portals fit together

```
                ┌──────────────┐
                │   /login     │  role tab: Customer or Partner
                └──────┬───────┘
                       │
        ┌──────────────┼────────────────┐
        ▼              ▼                ▼
   /home, /cart   /vendor/dashboard  /admin/dashboard
   /orders, …     /vendor/products   /admin/products
                  /vendor/register   /admin/vendors
```

- **Public self-registration** is offered for **customers** (via `/login` → Sign up) and **vendors** (via `/login` → "Become a Partner" → `/vendor/register`).
- **Vendor approval gate.** Newly-registered vendors start with `status = PENDING`. They cannot log in until an admin approves them. Login attempts in the meantime return `403 VENDOR_PENDING`, which the client renders as a "Awaiting approval" page.
- **Admin-uploaded products** (with `vendorId = null`) appear on the customer storefront as **Yobou Direct**, alongside products from approved vendors.

---

## API surface (summary)

```
POST   /api/auth/register            # new customer
POST   /api/auth/login               # any role; vendor must be APPROVED
POST   /api/auth/refresh             # silent refresh via httpOnly cookie
POST   /api/auth/logout
GET    /api/auth/me

GET    /api/products                 # public; ?category=…&q=…
GET    /api/products/:id             # public
POST   /api/products                 # vendor only (own products)
POST   /api/products/admin           # admin (Yobou Direct)
PATCH  /api/products/:id             # owner or admin
DELETE /api/products/:id             # owner or admin
GET    /api/products/categories      # public, grouped counts
GET    /api/products/vendor/mine     # vendor: own products

GET    /api/cart                     # auth
POST   /api/cart                     # auth
PATCH  /api/cart/:productId          # auth
DELETE /api/cart/:productId          # auth

POST   /api/orders                   # auth: place order, runs payment simulator
GET    /api/orders                   # auth: own orders
GET    /api/orders/:id               # auth: own / vendor-of / admin
PATCH  /api/orders/:id/status        # admin or vendor (vendor: own products only, can't set DELIVERED)

POST   /api/vendors/register         # public
GET    /api/vendors                  # admin
PATCH  /api/vendors/:id/status       # admin: APPROVED | REJECTED | PENDING

GET    /api/addresses                # auth
POST   /api/addresses                # auth

GET    /api/admin/kpis               # admin
GET    /api/admin/revenue-by-day     # admin

GET    /api/admin/products           # admin: ?q=&status=&vendor=<id>|direct&stock=low|out
POST   /api/admin/products/bulk      # admin: setStatus | assignVendor | setCategory | adjustPrice | setStock | delete
GET    /api/admin/products/export    # admin: CSV of the filtered catalogue
POST   /api/admin/products/import    # admin: { rows } — id ⇒ update, no id ⇒ create
GET    /api/products/vendor/:id      # vendor: one OWN product (404 for other stores)

GET    /api/admin/drivers            # admin: couriers + workload
POST   /api/admin/drivers            # admin: create courier account
GET    /api/admin/deliveries         # admin: ?status=&driverId=
GET    /api/admin/deliveries/queue   # admin: orders waiting for a courier
POST   /api/admin/orders/:id/assign-driver   # admin: { driverId }

GET    /api/driver/deliveries        # courier: ?scope=active|done (own jobs only)
POST   /api/driver/deliveries/:id/pickup
POST   /api/driver/deliveries/:id/deliver    # { recipientName?, proofNote?, codCollectedCents? }
POST   /api/driver/deliveries/:id/fail       # { reason }
```

---

## Order lifecycle

```
PLACED ──pay ok──> PAID ──vendor/admin──> PROCESSING ──vendor/admin──> SHIPPED ──admin──> DELIVERED
   │
   └─pay fail──> CANCELLED
   └─COD──> stays PLACED until delivery (paid on arrival)
```

Every transition writes a `TimelineEvent` row. The customer-facing **Track Order** page reads those rows and renders the `OrderTimeline` component.

### Last-mile delivery (Yobou couriers)

Orders can also be delivered by Yobou's own couriers (`User.role = DRIVER`, `Delivery` table):

```
admin assigns courier ──> ASSIGNED ──courier "picked up"──> PICKED_UP ──"delivered"──> DELIVERED
   (order → PROCESSING)                (order → SHIPPED)       │        (order → DELIVERED; COD marked paid)
                                                               └─"couldn't deliver"──> FAILED ──> back in the admin dispatch queue
```

- **Admin** → *Deliveries*: dispatch queue, live jobs, courier accounts (create / disable). Also assignable from an order's detail page.
- **Courier** → signs in to the Partner app and lands on `/courier`: drop-off address + Maps link, what to pick up from which store, cash to collect.
- Once a courier is assigned, vendors can no longer ship/deliver that order themselves (`409 COURIER_MANAGED`).

**Live GPS tracking** (`server/src/lib/tracking.js`, maps via Leaflet + OpenStreetMap, no API key). The courier goes *on duty* in the courier screen, which shares the phone's GPS (`POST /api/driver/location`); every fix is pushed live over SSE (`event: courier`) to the audiences allowed to see it:

| Platform | What it tracks |
| --- | --- |
| Admin → Deliveries → **Live map** | Every on-duty courier, their jobs, "signal lost" after 2 min; order page shows full route replay + proof-of-delivery point |
| Partner (vendor) order page | The courier heading to the store **until pickup** — then only status/timestamps (customer address stays private) |
| Shopper Track Order | The courier **from pickup to the door**, route since pickup, call button |
| Courier app | Duty switch, own position, delivery GPS saved as proof of delivery |

`GET /api/orders/:id/tracking` returns the role-shaped view; `GET /api/admin/fleet` feeds the fleet map; `POST /api/driver/duty` toggles sharing.

### Delivery code & courier rating

Each courier job gets a 4-digit **delivery code**, shown only to the customer (Track Order + an inbox message at pickup). The courier must enter it to complete the delivery (`INVALID_DELIVERY_CODE` otherwise). After delivery the customer can rate the courier once (`POST /api/orders/:id/rate-courier`); admins see each courier's average.

## Marketplace finance

`server/src/lib/ledger.js` keeps an append-only ledger per store:

| Event | Ledger entry |
| --- | --- |
| Order delivered | `EARNING` + (store's items − commission) — commission is per store (`Vendor.commissionBps`, default 10%) |
| Refund approved | `REFUND` − the store's share of the refund, commission reversed |
| Payout requested | `PAYOUT` − amount (reserved) → admin marks **paid** (with transfer reference) or **rejected** (`ADJUSTMENT` returns the funds) |

- **Partner → Payouts**: available balance, pending (paid, not yet delivered), lifetime sales/commission, statement, payout requests (min $10).
- **Admin → Finance**: commission earned, Yobou Direct sales, owed to stores, payouts to approve, per-store commission rate.
- **Admin → Deliveries → Couriers**: COD cash each courier still holds → **Settle** (the amount received must match).
- Orders delivered before the ledger existed are credited automatically on boot (idempotent backfill).

## Accounts & security

- **Rate limits** on sign-in, sign-up, password reset and promo-code checks (`server/src/lib/rateLimit.js`), plus a **per-account lockout** after 5 wrong passwords in 15 minutes (`429 TOO_MANY_ATTEMPTS`).
- **Forgot password** in all three apps (`/forgot-password` → email → `/reset-password?token=…`). Tokens are random, stored hashed, single-use, valid 30 minutes; the link opens the app matching the account's role. Admins can also send a reset link from **Users → Reset password** (handy for phone support).
- **Password change/reset signs out every other session** (`User.passwordChangedAt`).
- **Terms of Service** at `/terms.html` (served by the API, next to `/privacy.html`); sign-up in the shopper and partner apps requires accepting them and the server records `acceptedTermsAt` + `termsVersion`.
- Production builds of the admin app no longer show demo credentials.

## Promo codes

Admin → **Promotions**: percentage (optionally capped) or fixed-amount codes with minimum basket, start/end dates, total and per-customer limits. Customers apply a code on the checkout payment step; the server re-validates it when the order is placed and claims the use atomically. Cancelling an order gives the use back. Discounts are funded by Yobou — store earnings are computed on full item prices.

## Email

`server/src/lib/mailer.js` sends the password-reset email and an order confirmation with the receipt. Set `SMTP_URL` and `MAIL_FROM` (see `.env.example`); without them emails are printed to the server log.

## Launch checklist

Before opening to the public:

1. **Database — must do.** On Render's free plan the SQLite file lives in `/tmp` and is **wiped on every deploy/restart**. Provision PostgreSQL (Render, Neon, Supabase…), set `DATABASE_URL`, and switch `provider = "postgresql"` in `server/prisma/schema.prisma` (see [Switching to Postgres](#switching-to-postgres)). Product image uploads need persistent storage too (a Render disk or S3-compatible bucket).
2. **Email:** set `SMTP_URL` and `MAIL_FROM` on the server, and `SHOPPER_URL` / `PARTNER_URL` / `ADMIN_URL` if the apps move off GitHub Pages.
3. **Secrets:** long random `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`; change or delete the demo accounts (`*@yobou.test`).
4. **Payments:** card/PayPal are still simulated — wire `paymentSimulator.js` to a real provider (Stripe, or a local mobile-money aggregator) before taking real money.
5. **Legal:** have `terms.html` and `privacy.html` reviewed for your country, and fill in company details.
6. **Apps:** rebuild and publish the Android APKs so phones get the new screens (courier GPS needs the updated Partner APK).

## Roles & data access

| Capability | Admin | Vendor (partner) | Courier |
| --- | --- | --- | --- |
| Products | All stores; create/edit/delete apply immediately; bulk status / price % / stock / category / move-to-store / delete; CSV export & import | **Own store only**; every create/edit/delete is a change request the admin approves | — |
| Orders | All orders, cancel, ship, assign courier | Orders containing their products — **only their own line items and share** are returned | Only their assigned deliveries |
| Users, vendors, couriers, categories, refunds, audit log | Full control | Own profile | — |

---

## Payments (simulated)

`server/src/lib/paymentSimulator.js` exposes a single `pay({ method, amountCents, card })` function:

- `CARD` — 600 ms latency, 5% random decline (configurable via `PAYMENT_DECLINE_RATE`), returns `{ ok, txnId }`.
- `PAYPAL` — always succeeds, returns `{ ok, txnId }`.
- `COD` — always succeeds; order stays in `PLACED` with a "Pay on delivery" note.

To integrate real Stripe / PayPal:

1. Add SDK: `npm i stripe @paypal/checkout-server-sdk` (in `server/`).
2. Replace the body of `pay()` in `paymentSimulator.js` with calls to the real SDKs.
3. Add `STRIPE_SECRET_KEY` and `PAYPAL_CLIENT_ID/SECRET` to `.env`.
4. The order/payment routes and the `Order.paymentTxnId` field already capture whatever ID the SDK returns — no other code changes needed.

---

## Environment variables

All keys are documented in `.env.example`. Server-side keys live in `server/.env` (loaded via `dotenv`). Client-side keys must be prefixed `VITE_` and live in the same `server/.env` (the dev server reads them through Vite's proxy) or, more typically, in `APP_shopper_and_buyer/.env.local` / `Internal_Web_Admin/.env.local` (Vite picks those up automatically).

| Key                   | Where      | Notes                                                  |
| --------------------- | ---------- | ------------------------------------------------------ |
| `DATABASE_URL`        | server     | `file:./dev.db` (default) or Postgres URL in prod      |
| `JWT_ACCESS_SECRET`   | server     | 32+ random chars; rotate to invalidate all tokens      |
| `JWT_REFRESH_SECRET`  | server     | 32+ random chars; separate from access                 |
| `CORS_ORIGIN`         | server     | Frontend origin (comma-separated for multiple)         |
| `VITE_API_BASE`       | client / admin | API base URL; defaults to `''` (uses Vite proxy)     |
| `PAYMENT_DECLINE_RATE`| server     | 0–1, fraction of card attempts that fail (default 0.05) |

---

## Switching to Postgres

```bash
# 1. Set DATABASE_URL to a postgres:// URL
echo 'DATABASE_URL="postgresql://user:pass@host:5432/yobou"' >> .env

# 2. Switch the provider in server/prisma/schema.prisma:
#    datasource db { provider = "postgresql" url = env("DATABASE_URL") }

# 3. Apply the schema
npm run db:push
npm run seed
```

---

## Deploying

The server is configured to **serve the built React apps from `APP_shopper_and_buyer/dist` (or `Web_Version_APP/dist` as a fallback) and `Internal_Web_Admin/dist` in production**, so you can ship a single Node process. The admin app is mounted at `/admin/*` and the shopper app fills the rest.

```bash
# Build all three apps
npm run build           # shopper + web + admin

# Start the server (it picks up the dists automatically)
NODE_ENV=production npm start
```

To build the Android APK from `APP_shopper_and_buyer`:

```bash
cd APP_shopper_and_buyer
npm run cap:sync
npm run android:build:apk    # debug
npm run android:build:aab    # signed bundle for Play Store
```

### Recommended hosts

- **Render** — Web Service, build `npm install && npm run build && npm run db:push && npm run seed`, start `npm start`. Use the persistent disk for SQLite, or provision Postgres and set `DATABASE_URL`.
- **Railway** — same as above; one-click Postgres add-on.
- **Fly.io** — set `DATABASE_URL` to a Fly Postgres instance, deploy with their `fly launch` / `fly deploy` flow.
- **Docker** — see `Dockerfile` example in the comments of `server/src/index.js`.

For any host: set `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` to strong random strings, set `CORS_ORIGIN` to your public frontend URL, and provision a managed Postgres (recommended for production data durability).

---

## Development tips

- `npm run dev` runs both server and shopper with `concurrently`. Server uses `node --watch` for hot reload.
- `npm run db:studio` opens Prisma Studio so you can browse the data.
- `npm test` runs the server's supertest smoke tests.
- Vite proxies `/api` and `/uploads` to the server (see `APP_shopper_and_buyer/vite.config.js`), so during dev the apps use relative paths.

---

## License

MIT — do whatever you want with this.
