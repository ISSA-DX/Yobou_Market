# Yobou — Free Pilot Deployment Runbook

This guide deploys the entire Yobou stack (server + 3 web apps + Android APK)
on three free services. **Total monthly cost: $0.** **Credit card required: no.**

## Live URLs after deployment

| Component | URL |
|---|---|
| API server | `https://yobou-server.onrender.com` |
| Customer web app | `https://issa-dx.github.io/Yobou_Market/` |
| Admin web app | `https://issa-dx.github.io/Yobou_Market/admin/` |
| Web-version (browser-only shopper) | `https://issa-dx.github.io/Yobou_Market/web/` |
| Android APK (latest) | `https://github.com/ISSA-DX/Yobou_Market/releases/latest/download/yobou-market.apk` |

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

### Step 4 — Publish the Android APK as a Release (2 minutes)

You only need to do this once per release:

```powershell
cd C:\Users\issak\OneDrive\Desktop\Yobou
git tag v0.1.0
git push origin v0.1.0
```

Watch the build at **https://github.com/ISSA-DX/Yobou_Market/actions**.
When it finishes (~5 min), the APK is published at
**https://github.com/ISSA-DX/Yobou_Market/releases/latest/download/yobou-market.apk**.

Send this link to your 3 pilot testers. On Android, opening it triggers
the installer.

---

## What each pilot tester needs

Send each tester this message (customize the names):

> **Yobou pilot test — install instructions**
>
> **App install**
> 1. On your Android phone, open this link in Chrome:
>    https://github.com/ISSA-DX/Yobou_Market/releases/latest/download/yobou-market.apk
> 2. Chrome will say "This file might be harmful" — tap **Download anyway**.
> 3. Open the downloaded file. Android will ask "Allow from this source" —
>    tap **Settings**, toggle **Allow**, then back and tap **Install**.
> 4. Open the **Yobou Market** app from your home screen.
> 5. Log in with `shopper@yobou.test` / `Shopper123!`.
>
> **Web (browser)**
> Open https://issa-dx.github.io/Yobou_Market/ — same credentials.
>
> **Admin (browser only)**
> Open https://issa-dx.github.io/Yobou_Market/admin/ — log in with
> `admin@yobou.test` / `Admin123!`.
>
> **What to test**
> - Browse products, add to cart, place an order.
> - For admin: log in and approve the pending vendor
>   (`vendor2@yobou.test`) and any pending product changes.
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

### Update the Android APK

Tag a new release:

```powershell
git tag v0.1.1
git push origin v0.1.1
```

The workflow builds a new APK and attaches it to the GitHub Release.
The download link stays the same — it always points at the latest.

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