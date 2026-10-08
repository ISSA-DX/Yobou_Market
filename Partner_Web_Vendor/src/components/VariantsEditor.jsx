// VariantsEditor
// ---------------------------------------------------------------------------
// Optional color/size variant matrix editor for the Add/Edit product form.
//
// Why optional: vendors and admins often ship a single-SKU product with no
// matrix at all — the legacy single-stock UX already handles that case.
// This component is purely additive: the form publishes successfully even
// when `form.variants` is empty.
//
// Wire shape (matches server/src/lib/validators.js `variantInput`):
//   { id?: string, color: string, size: string, stock: number,
//     imageUrls?: string[] }
//
// Per-row rules:
//   - color and size are free-text, with a <datalist> hint of common
//     values. The datalist is a hint, not a constraint — typing "Dark
//     Crimson" is allowed.
//   - stock is a non-negative integer.
//   - imageUrls is the per-color photo gallery override. Empty array
//     means "fall back to the product-level imageUrls" on the storefront.
//     Cap is 10 per row, enforced server-side by the zod validator.
//   - The row's id is set after the server creates the row; PATCH sends
//     the id back so the server can reconcile (delete-removed, update-
//     kept, create-new) inside a single transaction.
import { useMemo, useRef, useState } from 'react';
import { apiForm } from '../api';
import Icon from './Icon';

// Common color suggestions — same as Material Design 3's "Suggested colors"
// set, just trimmed to what apparel/electronics vendors actually pick.
const COLOR_PRESETS = [
  'Black', 'White', 'Red', 'Blue', 'Green', 'Yellow',
  'Pink', 'Purple', 'Orange', 'Brown', 'Gray', 'Beige',
];

// Size presets span apparel letters (XS–XXL) + numeric (EU 36–44) +
// a One Size fallback for non-apparel categories.
const SIZE_PRESETS = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL',
  '36', '38', '40', '42', '44', 'One Size',
];

// Color names → hex. The previous version hashed the typed name into a
// random HSL hue, which meant picking "Red" sometimes rendered purple
// and "Blue" sometimes rendered green. The user is right: the swatch
// should match the color. We match by lower-casing the typed name and
// also test common synonyms ("Sky Blue" → blue, "Forest Green" → green)
// and the Material 3 "50/100/..." tints ("Red 300", "Blue 700"). Free-
// text names that don't match fall back to a neutral grey.
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

// Material 3 tint offsets — "Red 100" should still read as red, just
// lighter/darker. Map every "100/200/..." step to a multiplier on the
// base hex's lightness so "Blue 300" is a darker blue and "Blue 50" is
// a pale blue. Keys are case-insensitive.
const TINT_FACTORS = {
  '50':  1.35, // lighter
  '100': 1.25,
  '200': 1.15,
  '300': 1.05,
  '400': 1.0,
  '500': 1.0,  // base
  '600': 0.85,
  '700': 0.7,
  '800': 0.55,
  '900': 0.4,  // darker
};

// Parse "#rrggbb" → [r, g, b] 0–255.
function hexToRgb(hex) {
  const m = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!m) return [128, 128, 128];
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}
function rgbToHex(r, g, b) {
  const c = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
// Apply a lightness factor in HSL space: factor > 1 lightens, < 1 darkens.
function applyTint(hex, factor) {
  const [r, g, b] = hexToRgb(hex);
  // Simple linear blend toward white (factor > 1) or black (< 1).
  if (factor >= 1) {
    const f = factor - 1; // 0..0.35
    return rgbToHex(
      r + (255 - r) * f,
      g + (255 - g) * f,
      b + (255 - b) * f,
    );
  }
  return rgbToHex(r * factor, g * factor, b * factor);
}

// Returns a hex string for the swatch. Falls back to a neutral grey
// for unknown names, but the typed name is always rendered next to
// the swatch so the colour is never the only signal.
function nameToHex(name) {
  if (!name) return '#9ca3af';
  const raw = String(name).trim();
  // Strip common modifiers so "Dark Red" still matches red. Order
  // matters: "dark" must come before "red" would be detected.
  const MODIFIERS = new Set(['dark', 'light', 'pale', 'deep', 'bright',
    'sky', 'forest', 'sea', 'royal', 'hot', 'cold', 'mid',
    'pastel', 'muted', 'vivid', 'neon', 'matte', 'glossy',
    'metallic', 'navy', 'olive', 'teal', 'maroon', 'silver', 'gold',
    'crimson', 'scarlet', 'magenta', 'cyan', 'lime',
    'tan', 'khaki', 'salmon', 'coral', 'turquoise', 'lavender']);
  // Walk words from the end backwards so "Royal Blue" finds blue,
  // "Light Forest Green" finds green.
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

const MAX_VARIANT_IMAGES = 10; // matches zod validator cap

export default function VariantsEditor({ form, update, errors = {} }) {
  const variants = Array.isArray(form.variants) ? form.variants : [];
  // Quick-add inputs are local until "Add variant" commits them — that
  // way backspacing doesn't lose the typed value to the form state.
  const [draftColor, setDraftColor] = useState('');
  const [draftSize, setDraftSize] = useState('');
  const [draftStock, setDraftStock] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  // Per-row upload state: which row is mid-upload + the last error.
  // Tracked by row key so multiple rows can show their own spinner.
  const [rowUploading, setRowUploading] = useState({});
  const [rowUploadErr, setRowUploadErr] = useState({});
  // Hidden <input type=file> elements, one per row, ref'd by index.
  // We use a Map of refs so each row can be clicked independently.
  const fileRefs = useRef(new Map());
  const FALLBACK = `${import.meta.env.BASE_URL || '/'}seed-images/placeholder.svg`;

  // Row-level error flags. The form's validate() runs the same checks
  // and surfaces a top-level "errors.variants" message, but highlighting
  // the offending row in red helps the user fix it without scrolling.
  const rowErrors = useMemo(() => {
    if (!Array.isArray(errors.rows)) return {};
    return errors.rows.reduce((acc, e, i) => { if (e) acc[i] = e; return acc; }, {});
  }, [errors.rows]);

  const totalStock = variants.reduce((s, v) => s + (Number(v.stock) || 0), 0);
  const hasVariants = variants.length > 0;

  function commitDraft() {
    const color = draftColor.trim();
    const size = draftSize.trim();
    const stock = Math.max(0, parseInt(draftStock, 10) || 0);
    if (!color || !size) return false;
    const next = [...variants, { color, size, stock, imageUrls: [] }];
    update('variants', next);
    // Mirror stock to the legacy field so the form-level "Stock" input
    // stays visually consistent until the admin types into it directly.
    update('stock', totalStock + stock);
    setDraftColor('');
    setDraftSize('');
    setDraftStock('');
    return true;
  }

  function removeRow(i) {
    const next = variants.slice();
    next.splice(i, 1);
    update('variants', next);
  }

  function updateRow(i, patch) {
    const next = variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v));
    update('variants', next);
  }

  function clearAll() {
    update('variants', []);
    setConfirmClear(false);
  }

  function onDraftKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitDraft();
    }
  }

  // Per-row file picker plumbing. Reuses the same /api/products/upload
  // endpoint as the product-level gallery so we don't need a second
  // route. The server's multer config caps at 5 MB and restricts to
  // image/* — the validator caps the array length at 10.
  function pickFileFor(i) {
    const ref = fileRefs.current.get(i);
    if (ref) ref.click();
  }

  async function uploadForRow(i, files) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!images.length) {
      setRowUploadErr((s) => ({ ...s, [i]: 'Only image files (PNG, JPG, WEBP) are supported.' }));
      return;
    }
    const existing = Array.isArray(variants[i].imageUrls) ? variants[i].imageUrls : [];
    const room = Math.max(0, MAX_VARIANT_IMAGES - existing.length);
    if (room === 0) {
      setRowUploadErr((s) => ({ ...s, [i]: `Max ${MAX_VARIANT_IMAGES} images per variant.` }));
      return;
    }
    const accepted = images.slice(0, room);
    setRowUploading((s) => ({ ...s, [i]: true }));
    setRowUploadErr((s) => ({ ...s, [i]: '' }));
    try {
      const urls = [];
      for (const file of accepted) {
        const body = new FormData();
        body.append('image', file);
        const { url } = await apiForm('/api/products/upload', { body });
        urls.push(url);
      }
      updateRow(i, { imageUrls: [...existing, ...urls] });
    } catch (e) {
      const msg = e?.data?.message || e?.message || 'Could not upload image(s).';
      setRowUploadErr((s) => ({ ...s, [i]: msg }));
    } finally {
      setRowUploading((s) => ({ ...s, [i]: false }));
      const ref = fileRefs.current.get(i);
      if (ref) ref.value = '';
    }
  }

  function removeVariantImage(i, j) {
    const arr = Array.isArray(variants[i].imageUrls) ? [...variants[i].imageUrls] : [];
    arr.splice(j, 1);
    updateRow(i, { imageUrls: arr });
  }

  return (
    <section aria-labelledby="pf-variants" className="space-y-3 pt-3 border-t border-outline-variant/30">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="pf-variants" className="font-bold text-base">Variants <span className="text-on-surface-variant font-normal text-sm">(optional)</span></h3>
          <p className="text-label-md text-on-surface-variant">
            Add colors and sizes with per-option stock. Skip this section if your product is one-size / one-color.
          </p>
        </div>
        {hasVariants && (
          <div className="text-right shrink-0">
            <div className="text-label-sm text-on-surface-variant">Total stock</div>
            <div className="text-title-md font-bold">{totalStock}</div>
          </div>
        )}
      </div>

      {/* ───── Quick add ───── */}
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_5rem_auto] gap-2">
        <div>
          <label htmlFor="ve-color" className="sr-only">Color</label>
          <input
            id="ve-color"
            list="ve-color-list"
            className="input w-full"
            placeholder="Color (e.g. Black)"
            value={draftColor}
            onChange={(e) => setDraftColor(e.target.value)}
            onKeyDown={onDraftKey}
          />
          <datalist id="ve-color-list">
            {COLOR_PRESETS.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="ve-size" className="sr-only">Size</label>
          <input
            id="ve-size"
            list="ve-size-list"
            className="input w-full"
            placeholder="Size (e.g. M)"
            value={draftSize}
            onChange={(e) => setDraftSize(e.target.value)}
            onKeyDown={onDraftKey}
          />
          <datalist id="ve-size-list">
            {SIZE_PRESETS.map((s) => <option key={s} value={s} />)}
          </datalist>
        </div>
        <div>
          <label htmlFor="ve-stock" className="sr-only">Stock</label>
          <input
            id="ve-stock"
            type="number"
            min="0"
            className="input w-full"
            placeholder="Stock"
            value={draftStock}
            onChange={(e) => setDraftStock(e.target.value)}
            onKeyDown={onDraftKey}
          />
        </div>
        <button
          type="button"
          className="btn-secondary whitespace-nowrap"
          onClick={commitDraft}
          disabled={!draftColor.trim() || !draftSize.trim()}
          aria-label="Add variant"
        >
          <Icon name="add" className="text-[18px]" />
          Add variant
        </button>
      </div>

      {/* ───── Variant list ───── */}
      {variants.length === 0 ? (
        <div className="text-label-md text-on-surface-variant italic">
          No variants yet. The product will use a single stock count.
        </div>
      ) : (
        <ol className="space-y-2" aria-label="Product variants">
          {variants.map((v, i) => {
            const err = rowErrors[i];
            const imgs = Array.isArray(v.imageUrls) ? v.imageUrls : [];
            const uploadingRow = !!rowUploading[i];
            const errMsg = rowUploadErr[i];
            return (
              <li
                key={v.id || `${v.color}-${v.size}-${i}`}
                className={`flex flex-col gap-2 p-3 rounded-md border ${err ? 'border-error bg-error/5' : 'border-outline-variant/40 bg-surface-low'}`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-6 h-6 rounded-full border border-outline-variant/40 shrink-0"
                    style={{ backgroundColor: nameToHex(v.color) }}
                    aria-hidden="true"
                  />
                  <div className="flex-1 grid grid-cols-1 sm:grid-cols-[1fr_1fr_5rem] gap-2">
                    <input
                      aria-label={`Variant ${i + 1} color`}
                      className="input"
                      list="ve-color-list"
                      value={v.color}
                      onChange={(e) => updateRow(i, { color: e.target.value })}
                    />
                    <input
                      aria-label={`Variant ${i + 1} size`}
                      className="input"
                      list="ve-size-list"
                      value={v.size}
                      onChange={(e) => updateRow(i, { size: e.target.value })}
                    />
                    <input
                      aria-label={`Variant ${i + 1} stock`}
                      type="number"
                      min="0"
                      className="input"
                      value={v.stock}
                      onChange={(e) => updateRow(i, { stock: Math.max(0, parseInt(e.target.value, 10) || 0) })}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="w-9 h-9 rounded-md text-error hover:bg-error/10 shrink-0"
                    aria-label={`Remove variant ${v.color} / ${v.size}`}
                    title="Remove variant"
                  >
                    <Icon name="delete" className="text-[20px]" />
                  </button>
                </div>

                {/* Per-color photo gallery. Hidden on the quick-add row
                    (which doesn't exist in the variants array) and
                    optional in general — empty means "fall back to the
                    product-level images on the storefront". The picker
                    button is shown only for committed rows; new draft
                    rows are added with imageUrls=[] and the user can
                    upload after they're added. */}
                <div className="pl-9 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-label-sm text-on-surface-variant">
                      {imgs.length === 0
                        ? 'Cover image (optional) — falls back to product images'
                        : `${imgs.length} / ${MAX_VARIANT_IMAGES} image${imgs.length === 1 ? '' : 's'} for this color`}
                    </div>
                    <input
                      ref={(el) => {
                        if (el) fileRefs.current.set(i, el);
                        else fileRefs.current.delete(i);
                      }}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => uploadForRow(i, e.target.files)}
                    />
                    <button
                      type="button"
                      onClick={() => pickFileFor(i)}
                      disabled={uploadingRow || imgs.length >= MAX_VARIANT_IMAGES}
                      className="btn-secondary py-1 px-2 text-label-sm"
                      aria-label={`Upload images for ${v.color} / ${v.size}`}
                    >
                      {uploadingRow ? (
                        <>
                          <Icon name="progress_activity" className="text-[16px] animate-spin" />
                          Uploading…
                        </>
                      ) : (
                        <>
                          <Icon name="add_photo_alternate" className="text-[16px]" />
                          {imgs.length === 0 ? 'Add cover image' : 'Add image'}
                        </>
                      )}
                    </button>
                  </div>

                  {imgs.length > 0 && (
                    <ol
                      className="flex flex-wrap gap-2"
                      aria-label={`Images for ${v.color} / ${v.size}`}
                    >
                      {imgs.map((url, j) => (
                        <li
                          key={`${url}-${j}`}
                          className="relative w-14 h-14 rounded-md overflow-hidden bg-white border border-outline-variant/40"
                        >
                          <img
                            src={url}
                            alt=""
                            className="w-full h-full object-cover"
                            onError={(e) => { e.currentTarget.src = FALLBACK; }}
                          />
                          {j === 0 && (
                            <span className="absolute bottom-0 left-0 right-0 text-center text-[10px] bg-primary text-white px-1">
                              Cover
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeVariantImage(i, j)}
                            className="absolute top-0 right-0 w-5 h-5 rounded-full bg-white/90 text-error shadow-card flex items-center justify-center"
                            aria-label={`Remove image ${j + 1} from ${v.color} / ${v.size}`}
                            title="Remove"
                          >
                            <Icon name="close" className="text-[14px]" />
                          </button>
                        </li>
                      ))}
                    </ol>
                  )}

                  {errMsg && (
                    <div role="alert" className="text-error text-label-sm">{errMsg}</div>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {variants.length > 0 && (
        <div className="flex justify-end">
          {confirmClear ? (
            <div className="flex items-center gap-2 text-sm">
              <span>Remove all variants?</span>
              <button type="button" className="btn-secondary py-1 px-2" onClick={() => setConfirmClear(false)}>Cancel</button>
              <button type="button" className="btn-primary py-1 px-2 bg-error text-white" onClick={clearAll}>Clear all</button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmClear(true)}
              className="text-label-md text-error hover:underline"
            >
              Clear all variants
            </button>
          )}
        </div>
      )}

      {errors.variants && (
        <div role="alert" className="text-error text-sm">{errors.variants}</div>
      )}
    </section>
  );
}
