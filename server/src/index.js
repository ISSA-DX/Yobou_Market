require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');
const compression = require('compression');
// Read the version directly from package.json so /api/health can't
// drift from the truth after the next `npm version bump`.
const { version: SERVER_VERSION } = require('../package.json');

const authRoutes = require('./auth/routes');
const productsRoutes = require('./routes/products');
const productChangesRoutes = require('./routes/productChanges');
const cartRoutes = require('./routes/cart');
const ordersRoutes = require('./routes/orders');
const vendorOrdersRoutes = require('./routes/vendorOrders');
const vendorAnalyticsRoutes = require('./routes/vendorAnalytics');
const vendorsRoutes = require('./routes/vendors');
const adminRoutes = require('./routes/admin');
const refundsRoutes = require('./routes/refunds');
const addressesRoutes = require('./routes/addresses');
const paymentsRoutes = require('./routes/payments');
const categoriesRoutes = require('./routes/categories');
const eventsRoutes = require('./routes/events');
const reviewsRoutes = require('./routes/reviews');

const app = express();

// Behind a reverse proxy (Render, Railway, Fly, nginx), trust X-Forwarded-*
// so req.ip, rate limiters, and security middleware see the real client IP.
// `trust proxy` also tells Express to honor X-Forwarded-Proto, which in
// turn lets helmet's HSTS header only fire when the request is actually
// HTTPS (preventing a stale HSTS cache on a dev http instance). Required
// for Render — without this, every request looks like 127.0.0.1.
app.set('trust proxy', 1);

// helmet — sensible security headers on every response (nosniff,
// X-Frame-Options: SAMEORIGIN, Referrer-Policy: no-referrer, HSTS, etc.).
// CSP stays disabled here on purpose: the shopper/partner/pre-JS splash
// uses inline <script> + inline <style>, and the apps link fonts from
// fonts.googleapis.com. Tightening CSP needs nonces/allow-lists and is
// out of scope for this pass — the rest of helmet's headers still harden
// the API surface.
app.use(helmet({
  contentSecurityPolicy: false,
  // Cross-Origin-Resource-Policy defaults to `same-origin` which would
  // block the shopper on https://issa-dx.github.io from decoding images
  // served from the API host's /uploads/. Cross-origin is required so
  // GH-Pages + any future white-label host can still load product media.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  // COEP defaults to off; pin it explicitly so a future helmet upgrade
  // can't quietly turn it on and break every cross-origin image.
  crossOriginEmbedderPolicy: false,
}));

// compression — gzip JSON + static assets for ~70–80% bandwidth savings
// on list endpoints. Critically, we MUST skip streamed responses:
// compression buffers the response and breaks streaming, which would
// kill the live-sync notifications (`/api/events` SSE).
//
// Two-layer guard because the right "Accept" header can't be guaranteed:
//   - Layer 1: explicit path allow-list (`/api/events`). Cheap and the
//     only SSE endpoint in the codebase today.
//   - Layer 2: Accept header check. EventSource auto-sets
//     `Accept: text/event-stream`; fetch + ReadableStream does not. Belt
//     AND braces so either path-style safely skips compression.
// Allow multiple SSE paths; the current codebase only streams at
// `/api/events`, so the array has a single entry today. Adding a new
// streaming endpoint is a one-line change. The `startsWith(sp + '/')`
// branch covers future sub-paths (e.g. `/api/events/admin`).
const SSE_PATHS = ['/api/events'];
const isSsePath = (p) => SSE_PATHS.some((sp) => p === sp || p.startsWith(sp + '/'));
const shouldCompress = (req, res) => {
  if (isSsePath(req.path)) return false;
  const accept = (req.headers['accept'] || '').split(',').map((a) => a.trim());
  if (accept.includes('text/event-stream')) return false;
  return compression.filter(req, res);
};
// Threshold 256 bytes (below Express default 1kb) so the curated
// 28-category list, notification toggles, and other "small but
// compressible" JSON payloads actually benefit from gzip on mobile
// networks — which is the Yobou target audience. 1kb skips compression
// on the very responses that matter most for first-paint perf.
app.use(compression({ filter: shouldCompress, threshold: 256 }));

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// CORS — accept the dev origins, the bundled-into-API admin SPA, any
// localhost/127.0.0.1 origin (handles emulators, LAN testing, and the
// single-host prod layout where the API serves the SPAs itself), the
// Capacitor/Ionic mobile WebView schemes, and the GitHub Pages origin for
// the deployed pilot web apps. Anything else must be allow-listed via the
// CORS_ORIGIN env var (comma-separated).
//
// IMPORTANT: a rejected origin returns a structured 403 (with a JSON body
// the client can render), NOT a 500. Earlier versions threw inside the
// `cors` library and Express turned the throw into a generic 500, which
// surfaced on the client as the unhelpful "Something went wrong" — masking
// the real cause (an unlisted origin).
const ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',                  // shopper web (dev)
  'http://127.0.0.1:5173',
  'http://localhost:5174',                  // admin web (dev)
  'http://127.0.0.1:5174',
  'http://localhost:5175',                  // web-only shopper build (dev)
  'http://127.0.0.1:5175',
  'http://localhost:5176',                  // partner (vendor) web (dev)
  'http://127.0.0.1:5176',
  'http://localhost:4000',                  // admin SPA served by the API itself in single-host prod
  'http://127.0.0.1:4000',
  'http://localhost',
  'http://127.0.0.1',
  'https://localhost',                      // Capacitor's Android WebView scheme
  'capacitor://localhost',                  // Capacitor iOS + generic
  'ionic://localhost',                      // Ionic WebView fallback
  // GitHub Pages origin for the deployed pilot. Subpaths under this host
  // (/Yobou_Market/, /Yobou_Market/admin/) share the same origin so they're
  // covered by the single entry below.
  'https://issa-dx.github.io',
  ...(process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',').map((s) => s.trim()).filter(Boolean) : []),
]);

// Localhost-ish origin = dev convenience. Lets emulators (`http://10.0.2.2:*`
// on Android Studio), LAN IPs (`http://192.168.x.x:*` for testing the APK on
// a phone over Wi-Fi), and any custom port just work without re-deploying.
function isLocalishOrigin(origin) {
  if (!origin) return false;
  let u;
  try { u = new URL(origin); } catch { return false; }
  const httpish = u.protocol === 'http:' || u.protocol === 'https:';
  if (!httpish) return false;
  const host = u.hostname;
  // Loopback names + the Android emulator host alias + RFC1918 LAN ranges.
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '10.0.2.2') return true;
  // 192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12 — common LAN ranges for phone-on-Wi-Fi testing.
  const parts = host.split('.').map(Number);
  if (parts.length === 4 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  }
  return false;
}

function isOriginAllowed(origin) {
  if (!origin) return true;            // no Origin header — same-origin or native client, allow
  if (ALLOWED_ORIGINS.has(origin)) return true;
  if (isLocalishOrigin(origin)) return true;
  return false;
}

// Custom CORS middleware (replaces the `cors` package). It always answers
// preflight cleanly, never throws, and never returns 500. Disallowed origins
// get a 403 with a JSON body that names the unlisted origin so the operator
// knows exactly what to add to CORS_ORIGIN.
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowed = isOriginAllowed(origin);

  // Always advertise CORS so the browser sees our policy up front.
  if (allowed && origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (req.method === 'OPTIONS') {
    // Preflight — answer immediately so the browser can finish the handshake.
    if (!allowed) {
      return res.status(403).json({
        error: 'CORS_BLOCKED',
        message: `Origin "${origin || '(none)'}" is not allowed. Add it to CORS_ORIGIN in server/.env (comma-separated).`,
      });
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');
    return res.status(204).end();
  }

  // Real (non-preflight) request — if disallowed, send a clean 403 only on
  // /api/* (so static SPA assets keep working for cross-origin embedding).
  if (!allowed && origin && req.path.startsWith('/api/')) {
    return res.status(403).json({
      error: 'CORS_BLOCKED',
      message: `Origin "${origin}" is not allowed. Add it to CORS_ORIGIN in server/.env (comma-separated).`,
    });
  }

  next();
});
// IMPORTANT: Stripe webhook MUST be mounted BEFORE express.json()
// so the raw request body survives for Stripe's signature
// verification. The /api/payments router below applies requireAuth
// to the auth-gated routes (PaymentMethod CRUD, /intent); the
// webhook handler itself does its own checks via the Stripe SDK.
app.post(
  '/api/payments/webhook',
  express.raw({ type: 'application/json' }),
  require('./routes/payments').webhookHandler
);

app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// Static uploads
app.use('/uploads', express.static(UPLOAD_DIR));

// Static public assets (privacy policy, terms, robots.txt)
const publicDir = path.resolve(__dirname, '../public');
if (fs.existsSync(publicDir)) {
  app.use(express.static(publicDir));
}

// Health — extended to include version (sourced from package.json) +
// uptime so uptime monitors can scrape a single endpoint and so the
// frontend can show a heartbeat that doesn't lie after a version bump.
app.get('/api/health', (_req, res) =>
  res.json({
    ok: true,
    version: SERVER_VERSION,
    uptime: Math.round(process.uptime()),
    time: new Date().toISOString(),
  })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/product-changes', productChangesRoutes);
app.use('/api/cart', cartRoutes);
app.use('/api/orders', ordersRoutes);
app.use('/api/orders/vendor', vendorOrdersRoutes);
app.use('/api/vendor', vendorAnalyticsRoutes);
app.use('/api/vendors', vendorsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/refunds', refundsRoutes);
app.use('/api/addresses', addressesRoutes);
app.use('/api/payments', paymentsRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api', eventsRoutes);
// Mounted after /api/products so the products router's `/` list and
// `/:id` single-product routes still win. Reviews has no overlap with
// any product route, so it picks up `/products/:id/reviews` and
// `/reviews/:id` cleanly.
app.use('/api', reviewsRoutes);

// Serve the built React apps in production (single-deploy mode).
// The shopper portal has two build targets: APP_shopper_and_buyer (the Capacitor /
// Android APK source, whose Vite build also works as a web SPA) and Web_Version_APP
// (browser-only build of the same source). The API prefers the APK build since
// that's what the Play Store uses; if it's missing, fall back to the web build.
const shopperDist = path.resolve(__dirname, '../../APP_shopper_and_buyer/dist');
const webDist = path.resolve(__dirname, '../../Web_Version_APP/dist');
const adminDist = path.resolve(__dirname, '../../Internal_Web_Admin/dist');
const partnerDist = path.resolve(__dirname, '../../Partner_Web_Vendor/dist');
const clientDist = fs.existsSync(shopperDist) ? shopperDist : webDist;

// Partner (vendor) SPA — served at /partner/* (also serves /partner as index.html).
if (fs.existsSync(partnerDist)) {
  app.use('/partner', express.static(partnerDist));
  app.get('/partner', (_req, res) => res.sendFile(path.join(partnerDist, 'index.html')));
  app.get('/partner/*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(partnerDist, 'index.html'));
  });
}

// Admin SPA — served at /admin/* (also serves /admin as index.html).
if (fs.existsSync(adminDist)) {
  app.use('/admin', express.static(adminDist));
  app.get('/admin', (_req, res) => res.sendFile(path.join(adminDist, 'index.html')));
  app.get('/admin/*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(adminDist, 'index.html'));
  });
}

// Shopper SPA — serves everything else.
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// 404 handler for unknown API routes.
app.use('/api/*', (_req, res) => {
  res.status(404).json({ error: 'NOT_FOUND' });
});

// Error handler — v0.3.14 diagnostic: surface the actual error
// message + first few stack frames in production so we can see WHY
// the cart endpoint is 500ing. The render.yaml build runs
// `npx prisma generate` so the client is in sync, yet
// `prisma.cartItem.create({ include: { variant: true } })` still
// throws. We need the real error message to diagnose. This will be
// reverted once we know the root cause.
app.use((err, _req, res, _next) => {
  console.error('[server error]', err);
  res.status(500).json({
    error: 'INTERNAL',
    message: err.message || 'An internal server error occurred',
    code: err.code,
    name: err.name,
    stack: err.stack ? err.stack.split('\n').slice(0, 8).join('\n') : undefined,
  });
});

const port = Number(process.env.PORT || 4000);
if (require.main === module) {
  app.listen(port, () => {
    console.log(`[yobou] api listening on http://localhost:${port}`);
  });
}

module.exports = app;
