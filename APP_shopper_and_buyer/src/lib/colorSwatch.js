// colorSwatch
// ---------------------------------------------------------------------------
// Maps a free-text color name (e.g. "Red", "Dark Red", "Blue 300") to a
// hex string for use as a CSS background. Used by the admin/partner form
// preview and the customer storefront so the swatch always matches the
// typed name — not a random hash.
//
// Three apps import this:
//   - Internal_Web_Admin/src/components/{VariantsEditor,ProductPreviewCard}.jsx
//   - Partner_Web_Vendor/src/components/{VariantsEditor,ProductPreviewCard}.jsx
//   - APP_shopper_and_buyer/src/pages/product/ProductDetails.jsx
//
// The three apps are separate Vite projects (not a monorepo) so each
// has its own copy of this file. Keep them identical — drift between
// the copies would mean the live preview disagrees with the customer
// storefront, which is exactly the bug this file was created to fix.

// Base color name → hex. Covers the 12 common vendor choices plus 12
// extended names vendors actually use ("Navy", "Teal", "Gold", …).
// Matching is case-insensitive and the lookup is on the LAST word of
// the typed string, so "Dark Red" still resolves to red.
const COLOR_HEX = {
  black:   '#000000',
  white:   '#ffffff',
  red:     '#ef4444',
  blue:    '#3b82f6',
  green:   '#22c55e',
  yellow:  '#eab308',
  pink:    '#ec4899',
  purple:  '#a855f7',
  orange:  '#f97316',
  brown:   '#92400e',
  gray:    '#9ca3af',
  grey:    '#9ca3af',
  beige:   '#d6c7a3',
  navy:    '#1e3a8a',
  teal:    '#14b8a6',
  cyan:    '#06b6d4',
  magenta: '#d946ef',
  lime:    '#84cc16',
  olive:   '#65715b',
  maroon:  '#800000',
  silver:  '#c0c0c0',
  gold:    '#d4af37',
  ivory:   '#fffff0',
  cream:   '#fffdd0',
};

// Material 3 tint offsets. "Red 300" should still read as red, just
// slightly lighter. factor > 1 lightens (toward white), < 1 darkens
// (toward black).
const TINT_FACTORS = {
  '50':  1.35,
  '100': 1.25,
  '200': 1.15,
  '300': 1.05,
  '400': 1.0,
  '500': 1.0,  // base
  '600': 0.85,
  '700': 0.7,
  '800': 0.55,
  '900': 0.4,
};

// Common modifier words. Walk words from the end backwards so "Royal
// Blue" finds blue, "Light Forest Green" finds green, "Dark Red" finds
// red. Words not in this set AND not in COLOR_HEX are unknown — we
// keep scanning in case a later word is a real color.
const MODIFIERS = new Set([
  'dark', 'light', 'pale', 'deep', 'bright',
  'sky', 'forest', 'sea', 'royal', 'hot', 'cold', 'mid',
  'pastel', 'muted', 'vivid', 'neon', 'matte', 'glossy',
  'metallic', 'navy', 'olive', 'teal', 'maroon', 'silver', 'gold',
  'crimson', 'scarlet', 'magenta', 'cyan', 'lime',
  'tan', 'khaki', 'salmon', 'coral', 'turquoise', 'lavender',
]);

function hexToRgb(hex) {
  const m = String(hex).replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [128, 128, 128];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
// Apply a lightness factor: factor > 1 lightens, < 1 darkens.
function applyTint(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  if (factor >= 1) {
    const f = factor - 1; // 0..0.35
    return rgbToHex(r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f);
  }
  return rgbToHex(r * factor, g * factor, b * factor);
}

/**
 * Convert a free-text color name to a hex string suitable for use as a
 * CSS background. Returns a neutral grey for unknown / empty input.
 *
 * Examples:
 *   colorToHex('Red')           -> '#ef4444'  (red)
 *   colorToHex('Blue')          -> '#3b82f6'  (blue)
 *   colorToHex('Dark Red')      -> '#ef4444'  (modifier skipped)
 *   colorToHex('Sky Blue')      -> '#3b82f6'  (modifier skipped)
 *   colorToHex('Red 300')       -> '#f04d4d'  (Material 3 tint)
 *   colorToHex('Crimson')       -> '#9ca3af'  (unknown, neutral grey)
 *   colorToHex(null)            -> '#9ca3af'  (empty, neutral grey)
 */
export function colorToHex(name) {
  if (!name) return '#9ca3af';
  const raw = String(name).trim();
  const words = raw.split(/\s+/);
  let baseWord = null;
  for (let i = words.length - 1; i >= 0; i -= 1) {
    const w = words[i].toLowerCase();
    if (COLOR_HEX[w]) { baseWord = w; break; }
    if (!MODIFIERS.has(w)) continue;
  }
  if (!baseWord) return '#9ca3af';
  const tintMatch = raw.match(/\b(50|100|200|300|400|500|600|700|800|900)\b/);
  const tint = tintMatch ? TINT_FACTORS[tintMatch[1]] || 1 : 1;
  return applyTint(COLOR_HEX[baseWord], tint);
}
