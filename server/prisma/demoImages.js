// Artwork for the sample catalogue (prisma/demoCatalog.js).
//
// Each product gets a small SVG — its category's gradient, soft shapes
// and the product's emoji — written into every app's public/seed-images
// so it ships inside the APK and works offline, like the original seed
// images. Run via `npm run seed:demo` (or `node prisma/demoImages.js` to
// regenerate the files only).
const fs = require('node:fs');
const path = require('node:path');
const { DEMO_CATALOG } = require('./demoCatalog');

// Hex pairs matching the Tailwind gradients in the shopper app's
// lib/categoryTheme.js, so artwork and page headers agree.
const COLORS = {
  electronics: ['#3b82f6', '#4f46e5'], phones: ['#6366f1', '#7c3aed'], computer: ['#475569', '#1e293b'],
  fashion: ['#ec4899', '#f43f5e'], shoes: ['#f97316', '#f59e0b'], beauty: ['#fb7185', '#d946ef'],
  home: ['#f59e0b', '#ea580c'], kitchen: ['#14b8a6', '#059669'], sports: ['#22c55e', '#059669'],
  fitness: ['#84cc16', '#16a34a'], toys: ['#facc15', '#f97316'], gaming: ['#8b5cf6', '#7e22ce'],
  'tv-audio': ['#06b6d4', '#2563eb'], appliances: ['#78716c', '#44403c'], automotive: ['#ef4444', '#e11d48'],
  books: ['#10b981', '#0f766e'], grocery: ['#65a30d', '#15803d'], health: ['#0ea5e9', '#0891b2'],
  'pet-supplies': ['#f59e0b', '#ea580c'], baby: ['#e879f9', '#ec4899'], jewelry: ['#a855f7', '#4f46e5'],
  watches: ['#71717a', '#3f3f46'], bags: ['#f97316', '#d97706'], office: ['#737373', '#404040'],
  garden: ['#16a34a', '#047857'], tools: ['#6b7280', '#374151'], 'arts-crafts': ['#d946ef', '#9333ea'],
  'musical-instruments': ['#ef4444', '#db2777'],
};

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function imageFile(category, name) {
  return `${slugify(category)}--${slugify(name)}.svg`;
}

function renderSvg({ category, subcategory, emoji, index }) {
  const [a, b] = COLORS[slugify(category)] || ['#0047f1', '#0034b9'];
  // Vary composition per product so a row of cards doesn't look cloned.
  const angle = [135, 160, 110][index % 3];
  const blob = [[470, 120, 150], [120, 460, 170], [500, 500, 140]][index % 3];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
  <defs>
    <linearGradient id="g" gradientTransform="rotate(${angle - 90} .5 .5)">
      <stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/>
    </linearGradient>
    <radialGradient id="s" cx=".5" cy=".5" r=".5">
      <stop offset="0" stop-color="#000" stop-opacity=".28"/><stop offset="1" stop-color="#000" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="600" height="600" fill="url(#g)"/>
  <circle cx="${blob[0]}" cy="${blob[1]}" r="${blob[2]}" fill="#fff" opacity=".12"/>
  <circle cx="${600 - blob[0]}" cy="${600 - blob[1]}" r="${blob[2] / 2}" fill="#fff" opacity=".08"/>
  <circle cx="300" cy="285" r="175" fill="#fff" opacity=".16"/>
  <ellipse cx="300" cy="455" rx="150" ry="22" fill="url(#s)"/>
  <text x="300" y="300" font-size="210" text-anchor="middle" dominant-baseline="central"
    font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">${emoji}</text>
  <text x="300" y="545" font-size="26" font-weight="700" letter-spacing="4" text-anchor="middle" fill="#fff" opacity=".9"
    font-family="Inter, Segoe UI, Roboto, Arial, sans-serif">${esc(subcategory.toUpperCase())}</text>
</svg>
`;
}

// Every app bundles its own copy (see each app's lib/productImage.js).
const APP_DIRS = ['APP_shopper_and_buyer', 'Internal_Web_Admin', 'Partner_Web_Vendor']
  .map((app) => path.resolve(__dirname, '..', '..', app, 'public', 'seed-images', 'demo'));

function writeDemoImages() {
  let count = 0;
  for (const dir of APP_DIRS) fs.mkdirSync(dir, { recursive: true });
  for (const [category, subs] of Object.entries(DEMO_CATALOG)) {
    for (const [subcategory, items] of Object.entries(subs)) {
      items.forEach(([name, , , emoji], index) => {
        const svg = renderSvg({ category, subcategory, emoji, index });
        for (const dir of APP_DIRS) fs.writeFileSync(path.join(dir, imageFile(category, name)), svg);
        count++;
      });
    }
  }
  return count;
}

// Logo + banner for the sample store (shown on its store page and in
// "Shop by store" rows).
function writeStoreArt() {
  const logo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0047f1"/><stop offset="1" stop-color="#0034b9"/></linearGradient></defs>
  <rect width="200" height="200" rx="44" fill="url(#g)"/>
  <text x="100" y="118" font-size="96" font-weight="800" text-anchor="middle" fill="#fff" font-family="Inter, Segoe UI, Roboto, Arial, sans-serif">Y</text>
  <circle cx="150" cy="52" r="16" fill="#fdc003"/>
</svg>
`;
  const banner = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360" width="1200" height="360">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0034b9"/><stop offset=".6" stop-color="#0047f1"/><stop offset="1" stop-color="#7c3aed"/></linearGradient></defs>
  <rect width="1200" height="360" fill="url(#g)"/>
  <circle cx="1040" cy="80" r="190" fill="#fff" opacity=".08"/><circle cx="180" cy="360" r="160" fill="#fff" opacity=".06"/>
  <text x="600" y="210" font-size="120" text-anchor="middle" font-family="Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji, sans-serif">🛍️🎧👗🏠</text>
</svg>
`;
  for (const dir of APP_DIRS) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'store-logo.svg'), logo);
    fs.writeFileSync(path.join(dir, 'store-banner.svg'), banner);
  }
}

module.exports = { writeDemoImages, writeStoreArt, imageFile, slugify };

if (require.main === module) {
  console.log(`[demo] wrote ${writeDemoImages()} images into ${APP_DIRS.length} apps`);
}
