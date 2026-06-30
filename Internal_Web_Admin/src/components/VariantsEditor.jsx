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
//   { id?: string, color: string, size: string, stock: number }
//
// Per-row rules:
//   - color and size are free-text, with a <datalist> hint of common
//     values. The datalist is a hint, not a constraint — typing "Dark
//     Crimson" is allowed.
//   - stock is a non-negative integer.
//   - The row's id is set after the server creates the row; PATCH sends
//     the id back so the server can reconcile (delete-removed, update-
//     kept, create-new) inside a single transaction.
import { useMemo, useState } from 'react';
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

// Naïve name → hex colour hash so a swatch next to the typed name is
// instant feedback. Collisions on similar names ("Dark Red" / "Crimson")
// are acceptable; the typed name is also rendered next to the swatch
// so the colour is never the only signal.
function nameToHex(name) {
  if (!name) return '#9ca3af';
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h * 31 + name.charCodeAt(i)) >>> 0;
  }
  // Map hash to HSL with high saturation + light range so the swatch
  // is never muddy. Cycle hue through 360, fixed S=70%, L=50%.
  const hue = h % 360;
  return `hsl(${hue}, 70%, 50%)`;
}

export default function VariantsEditor({ form, update, errors = {} }) {
  const variants = Array.isArray(form.variants) ? form.variants : [];
  // Quick-add inputs are local until "Add variant" commits them — that
  // way backspacing doesn't lose the typed value to the form state.
  const [draftColor, setDraftColor] = useState('');
  const [draftSize, setDraftSize] = useState('');
  const [draftStock, setDraftStock] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);

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
    const next = [...variants, { color, size, stock }];
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
            return (
              <li
                key={v.id || `${v.color}-${v.size}-${i}`}
                className={`flex items-center gap-3 p-3 rounded-md border ${err ? 'border-error bg-error/5' : 'border-outline-variant/40 bg-surface-low'}`}
              >
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