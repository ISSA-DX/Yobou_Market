# Yobou — Free Pilot Deployment Runbook

This guide deploys the entire Yobou stack (server + 4 web apps + 2 Android APKs)
on three free services. **Total monthly cost: $0.** **Credit card required: no.**

## Live URLs after deployment

| Component | URL |
|---|---|
| API server | `https://yobou-server.onrender.com` |
| Customer web app | `https://issa-dx.github.io/Yobou_Market/` |
| Partner (vendor) web app | `https://issa-dx.github.io/Yobou_Market/partner/` |
| Admin web app | `https://issa-dx.github.io/Yobou_Market/admin/` |
| Web-version (browser-only shopper) | `https://issa-dx.github.io/Yobou_Market/web/` |
| Customer Android APK | `https://github.com/ISSA-DX/Yobou_Market/releases/latest/download/yobou-market.apk` |
| Partner Android APK | `https://github.com/ISSA-DX/Yobou_Market/releases/latest/download/yobou-partner.apk` |

> **Migration note (v0.2.0+):** As of v0.2.0, vendors use a **separate Yobou
> Partner app**. The vendor portal was removed from the customer APK to keep
> the two roles cleanly separated. Existing vendor users must install the
> new partner APK and sign in with the same credentials — their product
> history, change-requests, and notification inbox carry over.

---

## One-time setup (~15 minutes total)

### Step 1 — Create the repo on GitHub

The repo `ISSA-DX/Yobou_Market` doesn't exist yet (the GitHub API returns
404 for it). Create it first:

1. Go to **https://github.com/new** while signed in as `ISSA-DX`.
2. **Repository name:** `Yobou_Market` (exact case, with underscore).
3. **Visibility:** Public (GitHub Pages is free on public repos; private
   repos need GitHub Pro for Pages).
4. **DO NOT** check "Add a README", "Add .gitignore", or "Choose a
   license" — the project already has those (or doesn't need them).
5. Click **Create repository**.

Then push the code:

```powershell
cd C:\Users\issak\OneDrive\Desktop\Yobou
git init
git add .
git commit -m "Initial Yobou pilot deployment"
git branch -M main
git remote add origin https://github.com/ISSA-DX/Yobou_Market.git
git push -u origin main
```

If `git init` says "already a git repository" or you already pushed
before, just do the last three lines.

### Step 2 — Provision the API on Render (5 minutes)

1. Go to **https://dashboard.render.com/register** and sign in with your
   GitHub account (`ISSA-DX`).
2. Click **"New +"** → **"Blueprint"**.
3. Connect the `ISSA-DX/Yobou_Market` repo.
4. Render reads `render.yaml` and shows a plan to create:
   - A Node web service `yobou-server` (free plan)
   - A 1 GB persistent disk `yobou-data`
5. Click **"Apply"**. Render starts building.
6. While you wait (~3 min), go to the service's **Environment** tab.
   The two JWT secrets (`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`)
   are auto-generated. To replace them with your own (recommended for
   security), click each → edit → paste a long random string. Generate
   one with: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
7. When the build finishes, the **URL** is `https://yobou-server.onrender.com`.
8. Smoke test: open `https://yobou-server.onrender.com/api/health` in a
   browser. You should see `{"ok":true,"time":"..."}`. If you see that,
   the server is live.

### Step 3 — Enable GitHub Pages (2 minutes)

1. Go to **https://github.com/ISSA-DX/Yobou_Market/settings/pages**.
2. Under **Source**, choose **"GitHub Actions"** (not "Deploy from a branch").
3. The `deploy-web.yml` workflow auto-runs on the push you made in Step 1.
   Watch it at **https://github.com/ISSA-DX/Yobou_Market/actions**.
4. When it succeeds, the customer app is live at
   `https://issa-dx.github.io/Yobou_Market/`. The admin app is at
   `https://issa-dx.github.io/Yobou_Market/admin/`.

> **Note:** The very first request to the Render server after 15 min of
> no traffic takes ~30 seconds (cold start). Subsequent requests are fast.

### Step 4 — Publish the Android APKs as Releases (2 minutes each)

You only need to do this once per release. The two APKs have separate
tag prefixes so they don't collide on the same repo:

```powershell
# Customer app
git tag v0.2.0
git push origin v0.2.0

# Partner app (independent versioning; can be released separately)
git tag partner-v0.2.0
git push origin partner-v0.2.0
```

Watch the builds at **https://github.com/ISSA-DX/Yobou_Market/actions**.
When they finish (~5 min each), the APKs are published at:

- **Customer:** `https://github.com/ISSA-DX/Yobou_Market/releases/latest/download/yobou-market.apk`
- **Partner:** `https://github.com/ISSA-DX/Yobou_Market/releases/latest/download/yobou-partner.apk`

Send the relevant link to your testers. On Android, opening the link
triggers the installer. Both apps can be installed side-by-side on the
same device because they have different `appId`s (`com.yobou.market` vs
`com.yobou.partner`) and are signed by separate keystores.

---

## What each pilot tester needs

Send each tester this message (customize the names):

> **Yobou pilot test — install instructions**
>
> **App install — Customer (shoppers)**
> 1. On your Android phone, open this link in Chrome:
>    https://github.com/ISSA-DX/Yobou_Market/releases/latest/download/yobou-market.apk
> 2. Chrome will say "This file might be harmful" — tap **Download anyway**.
> 3. Open the downloaded file. Android will ask "Allow from this source" —
>    tap **Settings**, toggle **Allow**, then back and tap **Install**.
> 4. Open the **Yobou Market** app from your home screen.
> 5. Log in with `shopper@yobou.test` / `Shopper123!`.
>
> **App install — Vendor (partners)**
> 1. On your Android phone, open this link in Chrome:
>    https://github.com/ISSA-DX/Yobou_Market/releases/latest/download/yobou-partner.apk
> 2. Same "Allow from this source" flow as above.
> 3. Open the **Yobou Partner** app from your home screen.
> 4. Log in with `vendor1@yobou.test` / `Vendor123!` (or whichever vendor
>    credentials your admin sent you).
>
> The customer and partner apps install side-by-side on the same phone —
> different icons, different names, different keystores.
>
> **Web (browser)**
> Customer: https://issa-dx.github.io/Yobou_Market/
> Vendor: https://issa-dx.github.io/Yobou_Market/partner/
> Same credentials as the apps.
>
> **Admin (browser only)**
> Open https://issa-dx.github.io/Yobou_Market/admin/ — log in with
> `admin@yobou.test` / `Admin123!`.
>
> **What to test**
> - **Customer:** browse products, add to cart, place an order.
> - **Vendor:** approve a change request, ship an order with tracking,
>   upload a logo/banner in profile, edit business profile categories.
> - **Admin:** log in and approve a pending vendor and any pending
>   product changes. Confirm the partner app's notifications update live.
> - Try logging in with the wrong password and report what the screen says.
>
> **Reporting issues**
> Quote the exact text on the screen when something goes wrong.

---

## Updating the app after the pilot starts

### Update the API server

Push to `main`. Render auto-rebuilds and redeploys.

### Update a web app

Push to `main`. The `deploy-web.yml` workflow auto-builds and deploys
to GitHub Pages.

### Update the Android APKs

Tag a new release:

```powershell
# Customer app
git tag v0.2.1
git push origin v0.2.1

# Partner app (release independently)
git tag partner-v0.2.1
git push origin partner-v0.2.1
```

Each workflow builds the matching APK and attaches it to the GitHub
Release. The download links stay the same — they always point at the
latest.

---

## Why these three services and not others

| Service | Why we picked it | What it gives us |
|---|---|---|
| **Render** (free) | Persistent disk free, Node.js first-class, no credit card, generous idle behavior | Server + SQLite DB + uploaded images |
| **GitHub Pages** | Free static hosting from the same repo as the code, no extra account | Both web apps under one URL |
| **GitHub Releases** | Free APK distribution from the same repo, version-controlled | The APK install link for testers |

### Why not Railway?
Railway's free tier requires a credit card on file (their policy since
mid-2024). Render doesn't.

### Why not Fly.io?
Same — Fly requires a credit card even for the free allowance now.

### Why not Vercel/Netlify for the server?
They're great for static sites but their free tiers don't run a persistent
Node.js server with a disk. You'd have to migrate from SQLite to a cloud
DB, which is more work than it's worth for 3 testers.

---

## Cost summary

| Service | Plan | Monthly cost |
|---|---|---|
| Render | Free web service + 1 GB persistent disk | $0 |
| GitHub Pages | Free | $0 |
| GitHub Releases | Free, unlimited storage on public repos | $0 |
| Custom domain (optional) | e.g. `yobou.app` from a cheap registrar | ~$12/year |

Total for the pilot: **$0**.

---

## Limitations of the free tier to be aware of

- **Render spin-down:** if the API gets no traffic for 15 minutes, it
  sleeps. The next request takes ~30s to wake up. For 3 active testers,
  this happens during off-hours. Subsequent requests are fast.
- **Render build minutes:** 500 minutes/month free. Each deploy uses
  ~3 minutes. Plenty of headroom for active development.
- **GitHub Actions minutes:** 2,000 minutes/month free on public repos.
  Each deploy-web run uses ~2 minutes; each APK build uses ~5 minutes.
- **Render persistent disk:** 1 GB. The SQLite file is ~100 KB; uploaded
  product images take the rest. Easy to monitor in the Render dashboard.

If you outgrow these limits (say, 50+ testers), the migration to a paid
plan or a different host is straightforward — the architecture doesn't
change.

---

## Rollback procedure

If a deploy breaks something:

- **Server:** Render dashboard → yobou-server → "Manual Deploy" → choose
  the previous successful commit.
- **Web apps:** GitHub Actions → click the failed run → "Re-run jobs"
  on the previous successful workflow run.
- **APK:** Re-tag the previous good commit (`git tag v0.1.0 <commit-sha>`
  then `git push --tags --force`).

---

## Monitoring & debugging

- **Server logs:** Render dashboard → yobou-server → Logs tab (live tail)
- **Web deploy logs:** GitHub Actions → deploy-web workflow run
- **APK build logs:** GitHub Actions → release-apk workflow run
- **Cold-start wake-up:** the first request after idle takes ~30s; if
  testers report slow first load, that's normal.

---

## Next steps after the pilot

When you're ready to take the app to real customers:

1. **Custom domain** (e.g. `yobou.app`) — buy from a registrar, point DNS,
   set the Pages custom domain in repo settings.
2. **Postgres** instead of SQLite — Render's free Postgres tier is 90 days,
   then ~$0/mo for a small DB. Switch by updating `DATABASE_URL` and
   `prisma/schema.prisma`.
3. **Real keystore + Play Store** — generate a release keystore, sign the
   APK, upload to Google Play Console (one-time $25 fee).
4. **Email for password resets** — add an SMTP env var to Render (e.g.
   SendGrid free tier = 100 emails/day).

The deployment architecture doesn't need to change for any of these.

---

## Security notes

### Release APK signing

Each release APK is signed by a keystore that **must never be committed
to the repo**. The signing material is loaded from GitHub Actions
secrets at build time:

- **Customer app:** `YOBOU_KEYSTORE_BASE64`, `YOBOU_KEYSTORE_PASSWORD`,
  `YOBOU_KEY_ALIAS`, `YOBOU_KEY_PASSWORD`
- **Partner app:** `PARTNER_KEYSTORE_BASE64`, `PARTNER_KEYSTORE_PASSWORD`,
  `PARTNER_KEY_ALIAS`, `PARTNER_KEY_PASSWORD` (kept separate so rotation
  of one app's keystore doesn't force-co-rotate the other)

Local release builds can read the same values from `android/local.properties`
(gitignored).

If the keystore is **rotated** (e.g. compromised or expired), every
existing install of that APK must be **uninstalled** before the new APK
installs — Android refuses to upgrade across signing-cert mismatches.
Announce this in the release notes and consider bumping `versionCode` /
`versionName` in `android/app/build.gradle` to make the change visible.
The customer and partner apps have independent keystores, so a customer
APK rotation does **not** affect partner installs and vice versa.

### JWT secret rotation

`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (auto-generated by the
Render blueprint) can be rotated from the Render dashboard. Rotating
either secret **invalidates all sessions** — every logged-in user is
signed out. Plan the rotation for a low-traffic window.

---

## Admin / vendor / customer rollout

Run this end-to-end manual test on every release. All four apps must
work; admin is the source of truth.

1. `npm run db:push && npm run seed`
2. `npm run dev:all`
3. Log in as admin on `http://localhost:5174`. From `/products/new`,
   add a new product. Within ~5s it appears on the customer's
   `/home` recommended grid, AND a `product_approved`-style notification
   is written to the vendor's inbox (audience = vendor owner).
4. From `/vendors`, approve a pending vendor. Vendor can now log in at
   `http://localhost:5176/login` (the standalone **partner** app),
   gets routed to `/dashboard`.
5. As customer on `http://localhost:5173`, place an order. Vendor sees
   it in `/orders` on `http://localhost:5176` within 5s (SSE push).
6. As vendor, click into the order and **Ship** with a tracking number
   and carrier. Customer's `/orders/:id/track` updates within 5s; the
   "Track ↗" button points to the carrier's outbound URL.
7. As vendor, cancel a PAID order with a reason and `restoreStock=true`.
   Customer receives an `order_cancelled` in-app notification and stock
   is restored to the vendor's products only (other vendors on the same
   order are untouched).
8. As admin on `/broadcast`, send a broadcast with audience=`all`.
   Every connected user (admin/vendor/customer) receives a
   `admin_broadcast` notification within 5s.
9. Build both APKs (customer + partner) and install on Android devices.
   Verify:
   - **Customer app:** New bag+Y+tag icon renders at home screen, in
     install dialog, and in app switcher. Splash screen (pre-JS) shows
     the same bag+Y+tag mark.
   - **Partner app:** Separate icon (different brand mark) renders.
     Splash is the partner variant. The vendor can log in and reach
     `/dashboard`.
   - Both apps can be installed side-by-side on the same device (proving
     signing-cert isolation works).

If anything fails the manual test, the most likely culprits are:

- **SSE not surviving Vite HMR.** The shopper/admin SSE client
  reconnects every 3s on disconnect; the server's heartbeat is 25s.
  Long-running watch sessions over HMR are usually fine; a hard refresh
  may be needed if the connection is wedged.
- **Prisma migration on Render free tier.** Verify the persistent disk
  is mounted at `/var/data` — the migration runs on service start but
  fails silently if the disk isn't writable.
- **Role gating.** `RequireAuth` and `RequireApprovedVendor` gate
  customer and vendor routes respectively. A vendor who tries to visit
  `/home` while logged in via the same APK works fine — the routes
  share a session.

---

## Operations

### Audit log

Every admin action writes an `AdminAuditLog` row with actor, action,
entityType, entityId, and a JSON `meta` blob. View at
`http://localhost:5174/audit`. Filters: actor, action, entityType,
date range.

### Notification inbox

In-app notifications are the only channel this release ships with (no
email, no FCM). The bell icon in every app's header shows unread count
from `/api/notifications/unread`. Click an item to navigate + mark read.
`POST /api/notifications/read-all` marks everything read.

To add email/push later: extend `server/src/lib/notifications.js`'s
`notify()` with a transport, and gate on the user's existing
`notifyOrderUpdates`/`notifyShipping`/`notifyPromotions` preference
flags. SMTP credentials go in `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`
env vars; FCM keys in `FCM_SERVER_KEY`.

### Soft-disabled users

`User.disabledAt` blocks login via `auth/middleware.js`. Re-enable by
clearing the field (`PATCH /api/admin/users/:id { disabled: false }`).
Don't delete — soft-disable preserves order history and audit chain.

### Suspended vendors

`Vendor.status` can be `PENDING` | `APPROVED` | `REJECTED` | `SUSPENDED`.
`SUSPENDED` keeps the vendor's products visible but blocks them from
making any further `ProductChange` requests. Re-approve by setting
status back to `APPROVED` from the admin `/vendors/:id` page.

---

## Quality gates (run before tagging a release)

- `npm test` — all server tests must pass (50 cases, ~50s).
- `npm run build` in the repo root, `Internal_Web_Admin/`,
  `APP_shopper_and_buyer/`, and `Partner_Web_Vendor/` — all four must
  succeed.
- `npm run android:build:apk` — both APKs (customer + partner) must
  assemble without errors and launch on a device.

---

## Threat model (CIA)

**Confidentiality** — JWT secrets + keystore live in GH Actions secrets,
never in the repo. The rotation drill (§ Keystore rotation) is the
recovery mechanism. PII is limited to email + shipping address; no
payment data is stored (the simulator is a stand-in).

**Integrity** — every admin action is audit-logged with actor + meta.
Product mutations from vendors route through `ProductChange` approval;
admin is the final authority. Order state transitions follow an explicit
allow-list (PLACED → PAID → PROCESSING → SHIPPED → DELIVERED, plus
CANCELLED / REFUNDED); anything else is rejected with 400.

**Availability** — SSE has a 3s auto-reconnect on disconnect, and
client surfaces fall back to polling (every 15s on Track Order). The
notification inbox survives SSE outages (it's a DB row, not an in-memory
queue). Service degradation of one channel doesn't block writes on
others — `/api/notifications` keeps working even if the SSE event bus
is wedged.