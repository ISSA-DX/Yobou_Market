/**
 * Search by photo.
 *
 * Two matchers, combined when both are available:
 *
 *   1. Visual fingerprint (always on, no external service). Each product
 *      image is reduced to a colour histogram of its foreground, a 4×4
 *      colour layout and a 64-bit difference hash. A shopper's photo gets
 *      the same treatment and products are ranked by similarity. Works
 *      best when the photo shows one item, filling most of the frame.
 *
 *   2. AI description (optional). When ANTHROPIC_API_KEY is set, the photo
 *      is also sent to Claude, which names the item and picks a category.
 *      Products are then ranked mostly by those words, with the visual
 *      score as a tie-breaker. VISUAL_SEARCH_MODEL overrides the model.
 *
 * Fingerprints are cached in the ImageSignature table (keyed by image URL),
 * filled lazily during a search and by warmSignatures() after boot.
 */
const fs = require('fs');
const path = require('path');
const dns = require('dns').promises;
const net = require('net');
const sharp = require('sharp');
const { prisma } = require('../prisma');

const SIG_VERSION = 1;
const SIZE = 48;
const HUE_BINS = 12;
const BINS = HUE_BINS * 4 + 4; // 12 hues × 2 sat × 2 val, plus 4 greys
const MAX_REMOTE_BYTES = 8 * 1024 * 1024;
const SEARCH_COMPUTE_BUDGET_MS = 6000;

const UPLOAD_DIR = path.resolve(process.env.UPLOAD_DIR || './uploads');
const REPO_ROOT = path.resolve(__dirname, '../../..');
// Bundled sample images (/seed-images/...) ship with the front-ends.
const SEED_ROOTS = [
  'APP_shopper_and_buyer/public',
  'APP_shopper_and_buyer/dist',
  'Web_Version_APP/public',
  'Internal_Web_Admin/public',
].map((p) => path.join(REPO_ROOT, p));

// ---------------------------------------------------------------- fingerprint

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max ? d / max : 0, max / 255];
}

function binOf(r, g, b) {
  const [h, s, v] = rgbToHsv(r, g, b);
  if (s < 0.18 || v < 0.12) return HUE_BINS * 4 + Math.min(3, Math.floor(v * 4)); // greys
  const hb = Math.floor(h / (360 / HUE_BINS)) % HUE_BINS;
  return hb * 4 + (s >= 0.55 ? 2 : 0) + (v >= 0.6 ? 1 : 0);
}

/** Fingerprint an image buffer. Returns null if it can't be decoded. */
async function fingerprint(buffer) {
  let raw;
  try {
    raw = await sharp(buffer, { failOn: 'none', limitInputPixels: 50e6 })
      .rotate() // honour EXIF orientation from phone cameras
      .flatten({ background: '#ffffff' })
      .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
      .removeAlpha()
      .raw()
      .toBuffer();
  } catch {
    return null;
  }
  const px = (x, y) => { const i = (y * SIZE + x) * 3; return [raw[i], raw[i + 1], raw[i + 2]]; };

  // Background = mean colour of the outer 2-pixel ring.
  let br = 0; let bg = 0; let bb = 0; let bn = 0;
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (x > 1 && y > 1 && x < SIZE - 2 && y < SIZE - 2) continue;
      const [r, g, b] = px(x, y); br += r; bg += g; bb += b; bn++;
    }
  }
  br /= bn; bg /= bn; bb /= bn;

  const c = (SIZE - 1) / 2;
  const maxDist = Math.hypot(c, c);
  const fg = [];
  const all = [];
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const [r, g, b] = px(x, y);
      const w = 1 - 0.6 * (Math.hypot(x - c, y - c) / maxDist); // centre matters most
      all.push([r, g, b, w]);
      if (Math.hypot(r - br, g - bg, b - bb) > 45) fg.push([r, g, b, w]);
    }
  }
  const share = fg.length / all.length;
  const sample = share > 0.08 && share < 0.97 ? fg : all;

  const h = new Array(BINS).fill(0);
  let total = 0;
  for (const [r, g, b, w] of sample) { h[binOf(r, g, b)] += w; total += w; }
  const hist = h.map((v) => Math.round((v / total) * 10000) / 10000);

  // 4×4 colour layout.
  const cell = SIZE / 4;
  const grid = [];
  for (let gy = 0; gy < 4; gy++) {
    for (let gx = 0; gx < 4; gx++) {
      let r = 0; let g = 0; let b = 0; let n = 0;
      for (let y = gy * cell; y < (gy + 1) * cell; y++) {
        for (let x = gx * cell; x < (gx + 1) * cell; x++) { const p = px(x, y); r += p[0]; g += p[1]; b += p[2]; n++; }
      }
      grid.push(Math.round(r / n), Math.round(g / n), Math.round(b / n));
    }
  }

  // Difference hash on a 9×8 grey grid (block averages of the 48×48).
  const grey = [];
  for (let gy = 0; gy < 8; gy++) {
    for (let gx = 0; gx < 9; gx++) {
      const x0 = Math.floor((gx * SIZE) / 9); const x1 = Math.floor(((gx + 1) * SIZE) / 9);
      const y0 = gy * 6; const y1 = y0 + 6;
      let s = 0; let n = 0;
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const [r, g, b] = px(x, y); s += 0.299 * r + 0.587 * g + 0.114 * b; n++; }
      grey.push(s / n);
    }
  }
  let bits = '';
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits += grey[y * 9 + x] > grey[y * 9 + x + 1] ? '1' : '0';
  const dhash = BigInt(`0b${bits}`).toString(16).padStart(16, '0');

  return { v: SIG_VERSION, h: hist, g: grid, d: dhash };
}

// The shopper's photo, fingerprinted whole and as two centre crops: phone
// photos usually show the item with surroundings (a table, a shop shelf,
// a screen bezel) that product shots don't have. Each entry carries a
// small handicap so a crop only wins when it is clearly closer.
const QUERY_CROPS = [[1, 1], [0.75, 0.97], [0.55, 0.94]];

async function queryFingerprints(buffer) {
  let base;
  try {
    base = await sharp(buffer, { failOn: 'none', limitInputPixels: 50e6 })
      .rotate()
      .flatten({ background: '#ffffff' })
      .resize(640, 640, { fit: 'inside', withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
  } catch {
    return [];
  }
  const { data, info } = base;
  const out = [];
  for (const [f, weight] of QUERY_CROPS) {
    const width = Math.max(8, Math.round(info.width * f));
    const height = Math.max(8, Math.round(info.height * f));
    const img = f === 1 ? data : await sharp(data)
      .extract({ left: Math.floor((info.width - width) / 2), top: Math.floor((info.height - height) / 2), width, height })
      .png().toBuffer();
    const sig = await fingerprint(img);
    if (sig) out.push({ sig, weight });
  }
  // The item itself: strip a plain surround (table, wall, paper) of the
  // corner colour. Skipped when nothing, or almost everything, is removed.
  try {
    const { data: trimmed, info: t } = await sharp(data).trim({ threshold: 28 }).png().toBuffer({ resolveWithObject: true });
    const kept = (t.width * t.height) / (info.width * info.height);
    if (kept < 0.9 && kept > 0.08) {
      const sig = await fingerprint(trimmed);
      if (sig) out.push({ sig, weight: 1 });
    }
  } catch { /* uniform image — nothing to trim */ }
  return out;
}

function hamming(a, b) {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let n = 0;
  while (x) { n += Number(x & 1n); x >>= 1n; }
  return n;
}

/** Similarity of two fingerprints, 0..1. */
function similarity(a, b) {
  let inter = 0;
  for (let i = 0; i < BINS; i++) inter += Math.min(a.h[i] || 0, b.h[i] || 0);
  let gd = 0;
  for (let i = 0; i < a.g.length; i += 3) gd += Math.hypot(a.g[i] - b.g[i], a.g[i + 1] - b.g[i + 1], a.g[i + 2] - b.g[i + 2]);
  const layout = 1 - gd / (a.g.length / 3) / 441.7;
  const shape = 1 - hamming(a.d, b.d) / 64;
  return 0.6 * inter + 0.25 * layout + 0.15 * shape;
}

// ---------------------------------------------------------------- image loading

function isPrivateAddress(ip) {
  if (net.isIPv6(ip)) {
    const v = ip.toLowerCase();
    if (v.startsWith('::ffff:')) return isPrivateAddress(v.slice(7));
    return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80');
  }
  const [a, b] = ip.split('.').map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

function readInside(root, rel) {
  const file = path.resolve(root, `.${path.sep}${rel}`);
  if (!file.startsWith(root + path.sep)) return null; // no path traversal
  try { return fs.readFileSync(file); } catch { return null; }
}

async function fetchRemote(url) {
  let u;
  try { u = new URL(url); } catch { return null; }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
  // Product image URLs are typed by sellers — never let them make the
  // server call into its own network.
  try {
    const addrs = await dns.lookup(u.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) return null;
  } catch { return null; }
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 5000);
  try {
    const res = await fetch(u, { signal: ctrl.signal, redirect: 'error' });
    if (!res.ok) return null;
    if (Number(res.headers.get('content-length') || 0) > MAX_REMOTE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.length > MAX_REMOTE_BYTES ? null : buf;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Bytes for a product image URL, wherever it lives. */
async function loadImage(url) {
  if (typeof url !== 'string' || !url) return null;
  let pathname = url;
  if (/^https?:\/\//i.test(url)) {
    try { pathname = new URL(url).pathname; } catch { return null; }
  }
  // Our own uploads, whether stored as a relative or an absolute URL.
  const up = /^\/uploads\/([^/]+)$/.exec(pathname);
  if (up) {
    const local = readInside(UPLOAD_DIR, decodeURIComponent(up[1]));
    if (local) return local;
  }
  if (pathname.startsWith('/seed-images/') && !/^https?:/i.test(url)) {
    for (const root of SEED_ROOTS) {
      const buf = readInside(root, decodeURIComponent(pathname.slice(1)));
      if (buf) return buf;
    }
    return null;
  }
  return /^https?:\/\//i.test(url) ? fetchRemote(url) : null;
}

// ---------------------------------------------------------------- cache

const cache = new Map(); // url → fingerprint | null (null = unreadable)
let cacheLoaded = null;

function loadCache() {
  if (!cacheLoaded) {
    cacheLoaded = prisma.imageSignature.findMany().then((rows) => {
      for (const r of rows) {
        try {
          const s = JSON.parse(r.sig);
          if (s && s.v === SIG_VERSION) cache.set(r.url, s);
        } catch { /* recomputed on demand */ }
      }
    }).catch(() => { cacheLoaded = null; });
  }
  return cacheLoaded;
}

async function signatureFor(url) {
  if (cache.has(url)) return cache.get(url);
  const buf = await loadImage(url);
  const sig = buf ? await fingerprint(buf) : null;
  cache.set(url, sig);
  if (sig) {
    const data = { url, sig: JSON.stringify(sig) };
    await prisma.imageSignature.upsert({ where: { url }, create: data, update: { sig: data.sig } }).catch(() => {});
  }
  return sig;
}

function productImages(p) {
  let urls = p.imageUrls;
  if (typeof urls === 'string') { try { urls = JSON.parse(urls); } catch { urls = []; } }
  return (Array.isArray(urls) ? urls : []).filter((u) => typeof u === 'string' && u).slice(0, 2);
}

/** Fill fingerprints for every product image, a few at a time. */
async function warmSignatures({ where = {}, concurrency = 3 } = {}) {
  await loadCache();
  const products = await prisma.product.findMany({ where, select: { imageUrls: true } });
  const todo = [...new Set(products.flatMap(productImages))].filter((u) => !cache.has(u));
  let i = 0;
  const worker = async () => { while (i < todo.length) await signatureFor(todo[i++]); };
  await Promise.all(Array.from({ length: concurrency }, worker));
  return todo.length;
}

let warming = null;
function warmInBackground() {
  if (!warming) warming = warmSignatures().catch(() => {}).finally(() => { warming = null; });
  return warming;
}

// ---------------------------------------------------------------- AI description

const STOP = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'with', 'in', 'on', 'to', 'set', 'pack']);

function tokens(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !STOP.has(t));
}

async function describeWithAi(buffer, categoryNames) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const jpeg = await sharp(buffer, { failOn: 'none' }).rotate().flatten({ background: '#ffffff' })
      .resize(768, 768, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 80 }).toBuffer();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.VISUAL_SEARCH_MODEL || 'claude-haiku-5-5',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
            {
              type: 'text',
              text: 'A shopper took this photo to find the item in an online shop. Identify the main product. '
                + 'Reply with JSON only, no prose: {"label": "2-5 word product name", '
                + '"keywords": ["up to 6 lowercase search words, most specific first"], '
                + `"category": one of ${JSON.stringify(categoryNames)} or null, "colors": ["main colours"]}. `
                + 'If there is no product in the photo, reply {"label": null}.',
            },
          ],
        }],
      }),
    }).finally(() => clearTimeout(timer));
    if (!res.ok) return null;
    const body = await res.json();
    const text = (body.content || []).map((c) => c.text || '').join('');
    const json = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    if (!json || !json.label) return { label: null, keywords: [], category: null, colors: [] };
    return {
      label: String(json.label).slice(0, 60),
      keywords: (Array.isArray(json.keywords) ? json.keywords : []).flatMap(tokens).slice(0, 8),
      category: categoryNames.includes(json.category) ? json.category : null,
      colors: (Array.isArray(json.colors) ? json.colors : []).flatMap(tokens).slice(0, 3),
    };
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- search

/**
 * Rank products against a photo.
 *   where — Prisma filter for the candidate products (e.g. LIVE only).
 * Returns { ranked: [{ id, score }], ai, mode, pending }.
 */
async function searchByImage(buffer, { where = {}, limit = 24 } = {}) {
  const queries = await queryFingerprints(buffer);
  if (!queries.length) {
    const err = new Error('UNREADABLE_IMAGE');
    err.status = 400;
    throw err;
  }
  await loadCache();
  const [products, cats] = await Promise.all([
    prisma.product.findMany({
      where,
      select: { id: true, name: true, category: true, subcategory: true, description: true, imageUrls: true },
    }),
    prisma.category.findMany({ where: { isActive: true }, select: { name: true } }),
  ]);
  const aiPromise = describeWithAi(buffer, cats.map((c) => c.name));

  // Fill missing fingerprints within a time budget; the rest warm later.
  const deadline = Date.now() + SEARCH_COMPUTE_BUDGET_MS;
  const missing = [...new Set(products.flatMap(productImages))].filter((u) => !cache.has(u));
  let mi = 0;
  const worker = async () => { while (mi < missing.length && Date.now() < deadline) await signatureFor(missing[mi++]); };
  await Promise.all([worker(), worker(), worker(), worker()]);
  const pending = missing.length - Math.min(mi, missing.length);
  if (pending > 0) warmInBackground();

  const ai = await aiPromise;
  const words = ai ? [...new Set([...ai.keywords, ...ai.colors])] : [];
  const scored = [];
  for (const p of products) {
    let visual = 0;
    for (const u of productImages(p)) {
      const s = cache.get(u);
      if (s) for (const q of queries) visual = Math.max(visual, q.weight * similarity(q.sig, s));
    }
    let score = visual;
    if (ai && ai.label) {
      const name = new Set(tokens(p.name));
      const rest = new Set([...tokens(p.category), ...tokens(p.subcategory), ...tokens(p.description)]);
      let hit = 0;
      ai.keywords.forEach((w, i) => {
        const weight = 1 / (1 + i * 0.25); // earlier words are more specific
        if (name.has(w)) hit += 2 * weight; else if (rest.has(w)) hit += weight;
      });
      ai.colors.forEach((w) => { if (name.has(w) || rest.has(w)) hit += 0.3; });
      const text = Math.min(1, hit / 4);
      const cat = ai.category && p.category === ai.category ? 1 : 0;
      score = 0.55 * text + 0.15 * cat + 0.3 * visual;
    }
    if (visual > 0 || score > 0) scored.push({ id: p.id, score });
  }
  scored.sort((a, b) => b.score - a.score);
  // Visual-only: keep the close-ish ones. With AI words, drop zero-text noise.
  const top = scored[0]?.score || 0;
  const floor = ai && ai.label ? Math.max(0.12, top * 0.35) : Math.max(0.35, top * 0.75);
  const ranked = scored.filter((s) => s.score >= floor).slice(0, limit)
    .map((s) => ({ id: s.id, score: Math.round(s.score * 1000) / 1000 }));
  return {
    ranked,
    ai: ai && ai.label ? { label: ai.label, keywords: ai.keywords, category: ai.category } : null,
    mode: ai && ai.label ? 'ai' : 'visual',
    words,
    pending,
  };
}

module.exports = {
  fingerprint,
  similarity,
  loadImage,
  isPrivateAddress,
  searchByImage,
  warmSignatures,
  warmInBackground,
  _cache: cache,
};
