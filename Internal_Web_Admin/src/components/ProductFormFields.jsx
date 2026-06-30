// ProductFormFields — fields shared by the admin and partner product
// forms. The visual style is intentionally simple (Tailwind utility
// classes from the project's `.input` / `.btn-*` set) so both apps
// render identically.
//
// Accessibility:
//   - Every input has an associated <label htmlFor> (or aria-label for
//     the icon-only remove button).
//   - Required inputs set aria-required and get aria-describedby
//     pointing at the field's help text.
//   - The drop zone is keyboard-focusable (tabindex=0) and Enter /
//     Space opens the file picker — same affordance as a real button.
//
// Media model:
//   - imageUrls[] is the source of truth. Order matters: index 0 is
//     the cover shown in the catalog grid and on the product detail
//     page. The UI exposes ↑ / ↓ buttons and a "Set as cover" radio
//     to reorder without leaving the form.
import { useRef, useState } from 'react';
import { apiForm } from '../api';
import CategoryPicker from './CategoryPicker';
import VariantsAccordion from './VariantsAccordion';
import Icon from './Icon';

export default function ProductFormFields({ form, update, errors = {} }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');
  const [dragging, setDragging] = useState(false);

  async function uploadFile(file) {
    const body = new FormData();
    body.append('image', file);
    const { url } = await apiForm('/api/products/upload', { body });
    return url;
  }

  async function handleFiles(files) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!images.length) {
      setUploadErr('Only image files (PNG, JPG, WEBP) are supported.');
      return;
    }
    setUploading(true);
    setUploadErr('');
    try {
      const urls = await Promise.all(images.map(uploadFile));
      update('imageUrls', [...(form.imageUrls || []), ...urls]);
    } catch (e) {
      // Prefer the server's structured message; fall back to the network
      // banner from `apiForm`'s NETWORK_ERROR branch, then to a generic line.
      const msg = e?.data?.message || e?.message || 'Could not upload image(s).';
      setUploadErr(msg);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removeImage(i) {
    const arr = [...(form.imageUrls || [])];
    arr.splice(i, 1);
    update('imageUrls', arr);
  }

  function moveImage(i, dir) {
    const arr = [...(form.imageUrls || [])];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    update('imageUrls', arr);
  }

  function setAsCover(i) {
    if (i === 0) return;
    const arr = [...(form.imageUrls || [])];
    const [picked] = arr.splice(i, 1);
    arr.unshift(picked);
    update('imageUrls', arr);
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  const imgs = form.imageUrls || [];
  const FALLBACK = `${import.meta.env.BASE_URL || '/'}seed-images/placeholder.svg`;
  const onImgError = (e) => { e.currentTarget.src = FALLBACK; };

  return (
    <div className="space-y-6">
      {/* ───── Identity ───── */}
      <section aria-labelledby="pf-identity" className="space-y-3">
        <div>
          <h3 id="pf-identity" className="font-bold text-base">Identity</h3>
          <p className="text-label-md text-on-surface-variant">How shoppers find and recognise your product.</p>
        </div>

        <div>
          <label htmlFor="pf-name" className="text-label-md text-on-surface-variant">
            Product name <span aria-hidden="true" className="text-error">*</span>
          </label>
          <input
            id="pf-name"
            className="input mt-1"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            placeholder="e.g. Wireless Earbuds Pro"
            aria-required="true"
            aria-invalid={Boolean(errors.name) || undefined}
            aria-describedby={errors.name ? 'pf-name-err' : 'pf-name-help'}
            required
          />
          {errors.name ? (
            <div id="pf-name-err" role="alert" className="text-error text-sm mt-1">{errors.name}</div>
          ) : (
            <div id="pf-name-help" className="text-label-sm text-on-surface-variant mt-1">
              Use the brand name shoppers search for (e.g. “Anker Soundcore Life P3”).
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="pf-category" className="text-label-md text-on-surface-variant">
              Category <span aria-hidden="true" className="text-error">*</span>
            </label>
            <CategoryPicker
              id="pf-category"
              value={form.category}
              onChange={(v) => update('category', v)}
              error={errors.category}
            />
            {errors.category && (
              <div role="alert" className="text-error text-sm mt-1">{errors.category}</div>
            )}
          </div>
          <div>
            <label htmlFor="pf-stock" className="text-label-md text-on-surface-variant">
              Stock <span aria-hidden="true" className="text-error">*</span>
            </label>
            <input
              id="pf-stock"
              type="number"
              min="0"
              // Once the product has variants, Product.stock is the
              // sum-of-variants — the legacy single field is derived
              // and read-only so the user can't type a contradictory
              // number. The variants matrix is the only source of truth.
              readOnly={Array.isArray(form.variants) && form.variants.length > 0}
              className="input mt-1"
              value={form.stock}
              onChange={(e) => update('stock', Math.max(0, Number(e.target.value) || 0))}
              aria-required="true"
              aria-invalid={Boolean(errors.stock) || undefined}
              aria-describedby="pf-stock-help"
              required
            />
            <div id="pf-stock-help" className="text-label-sm text-on-surface-variant mt-1">
              {Array.isArray(form.variants) && form.variants.length > 0
                ? 'Auto-calculated as the sum of variant stocks. Edit per-row stock below.'
                : 'Units available. Set to 0 to mark “Out of stock” without removing the listing.'}
            </div>
          </div>
        </div>

        {/* Variants live in the Identity card, collapsed by default, so
            the optional feature is visible without scrolling past the
            rest of the form. */}
        <VariantsAccordion form={form} update={update} errors={errors.variants || {}} />
      </section>

      {/* ───── Pricing ───── */}
      <section aria-labelledby="pf-pricing" className="space-y-3 pt-3 border-t border-outline-variant/30">
        <div>
          <h3 id="pf-pricing" className="font-bold text-base">Pricing</h3>
          <p className="text-label-md text-on-surface-variant">What shoppers pay at checkout.</p>
        </div>
        <div>
          <label htmlFor="pf-price" className="text-label-md text-on-surface-variant">
            Price (USD) <span aria-hidden="true" className="text-error">*</span>
          </label>
          <div className="mt-1 relative">
            <span aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
            <input
              id="pf-price"
              type="number"
              min="0"
              step="0.01"
              className="input pl-7"
              value={(form.priceCents / 100).toFixed(2)}
              onChange={(e) => update('priceCents', Math.round(Math.max(0, Number(e.target.value) || 0) * 100))}
              aria-required="true"
              aria-invalid={Boolean(errors.priceCents) || undefined}
              aria-describedby={errors.priceCents ? 'pf-price-err' : 'pf-price-help'}
              required
            />
          </div>
          {errors.priceCents ? (
            <div id="pf-price-err" role="alert" className="text-error text-sm mt-1">{errors.priceCents}</div>
          ) : (
            <div id="pf-price-help" className="text-label-sm text-on-surface-variant mt-1">
              Stored in cents to avoid floating-point rounding on totals.
            </div>
          )}
        </div>
      </section>

      {/* ───── Description ───── */}
      <section aria-labelledby="pf-desc" className="space-y-3 pt-3 border-t border-outline-variant/30">
        <div>
          <h3 id="pf-desc" className="font-bold text-base">Description</h3>
          <p className="text-label-md text-on-surface-variant">Features, materials, dimensions, warranty — what a shopper needs to know.</p>
        </div>
        <div>
          <label htmlFor="pf-description" className="sr-only">Product description</label>
          <textarea
            id="pf-description"
            className="input min-h-32"
            value={form.description}
            onChange={(e) => update('description', e.target.value)}
            placeholder="What makes this product special? What's in the box? Any warranty terms?"
          />
          <div className="text-label-sm text-on-surface-variant mt-1">
            Plain text is fine. Markdown is not rendered on the storefront yet.
          </div>
        </div>
      </section>

      {/* ───── Media ───── */}
      <section aria-labelledby="pf-media" className="space-y-3 pt-3 border-t border-outline-variant/30">
        <div>
          <h3 id="pf-media" className="font-bold text-base">Media</h3>
          <p className="text-label-md text-on-surface-variant">
            The <strong>first image</strong> is the cover shoppers see in the catalog grid. Use a square or 4:3 photo for best results.
          </p>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div
          role="button"
          tabIndex={0}
          aria-label="Upload product images"
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              fileRef.current?.click();
            }
          }}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`card border-2 border-dashed p-6 flex flex-col items-center text-on-surface-variant text-center cursor-pointer transition-colors ${
            dragging ? 'border-primary bg-primary/5' : 'border-outline/40 hover:bg-surface-low'
          }`}
        >
          <div className="w-10 h-10 rounded-full bg-surface-low flex items-center justify-center mb-2">
            {uploading ? (
              <Icon name="progress_activity" className="text-[22px] animate-spin text-primary" />
            ) : (
              <Icon name="add_photo_alternate" className="text-[22px]" />
            )}
          </div>
          <div className="text-sm font-medium text-on-surface">
            {uploading ? 'Uploading…' : dragging ? 'Release to upload' : 'Drag & drop or click to upload'}
          </div>
          <div className="text-label-sm mt-1">PNG, JPG, WEBP up to 5 MB each · multiple files OK</div>
        </div>

        {uploadErr && (
          <div role="alert" className="card p-3 bg-error/10 text-error text-sm flex items-start gap-2">
            <Icon name="error" className="text-[18px] shrink-0" />
            <span>{uploadErr}</span>
          </div>
        )}

        {imgs.length === 0 ? (
          <div className="text-label-md text-on-surface-variant italic">
            You haven't added images yet. Uploaded images will appear here and the cover will be the first one.
          </div>
        ) : (
          <ol
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
            aria-label="Uploaded product images. Use the arrows or Set as cover buttons to reorder."
          >
            {imgs.map((url, i) => (
              <li
                key={`${url}-${i}`}
                className={`relative aspect-square rounded-md overflow-hidden bg-surface-low border-2 ${
                  i === 0 ? 'border-primary' : 'border-transparent'
                }`}
              >
                <img src={url} alt={i === 0 ? 'Cover image' : `Image ${i + 1}`} className="w-full h-full object-cover" onError={onImgError} />
                {i === 0 && (
                  <span className="absolute top-1 left-1 chip bg-primary text-white text-[11px]">
                    <Icon name="star" className="text-[12px]" /> Cover
                  </span>
                )}
                <div className="absolute top-1 right-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setAsCover(i)}
                    disabled={i === 0}
                    className="w-7 h-7 rounded-full bg-white/90 shadow-card text-on-surface disabled:opacity-30"
                    aria-label={`Set image ${i + 1} as cover`}
                    title="Set as cover"
                  >
                    <Icon name="star" className="text-[16px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="w-7 h-7 rounded-full bg-white/90 shadow-card text-error"
                    aria-label={`Remove image ${i + 1}`}
                    title="Remove"
                  >
                    <Icon name="close" className="text-[16px]" />
                  </button>
                </div>
                <div className="absolute bottom-1 left-1 flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => moveImage(i, -1)}
                    disabled={i === 0}
                    className="w-7 h-7 rounded-full bg-white/90 shadow-card text-on-surface disabled:opacity-30"
                    aria-label={`Move image ${i + 1} up`}
                    title="Move up"
                  >
                    <Icon name="arrow_upward" className="text-[16px]" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveImage(i, 1)}
                    disabled={i === imgs.length - 1}
                    className="w-7 h-7 rounded-full bg-white/90 shadow-card text-on-surface disabled:opacity-30"
                    aria-label={`Move image ${i + 1} down`}
                    title="Move down"
                  >
                    <Icon name="arrow_downward" className="text-[16px]" />
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}
      </section>

    </div>
  );
}