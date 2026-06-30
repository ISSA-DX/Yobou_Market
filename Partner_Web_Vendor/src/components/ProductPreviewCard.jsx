// Vendor-aware preview card — same data shape as the admin preview
// but the brand pill shows the vendor's business name (instead of
// "Yobou Direct") and the brand banner/logo is rendered at the top
// when set.
//
// Reuses productImage so the same image-render fix applies here.
import Icon from './Icon';
import { productImage } from '../lib/productImage';
import { colorToHex } from '../lib/colorSwatch';
import { useStore } from '../store';

const FALLBACK = `${import.meta.env.BASE_URL || '/'}seed-images/placeholder.svg`;

export default function ProductPreviewCard({ form }) {
  const user = useStore((s) => s.user);
  const vendorName = user?.vendor?.businessName || user?.name || 'Your store';

  const fake = {
    imageUrls: form.imageUrls || [],
    category: form.category,
  };
  const img = productImage(fake);
  const price = form.priceCents > 0 ? `$${(form.priceCents / 100).toFixed(2)}` : '—';
  const status = form.status || 'LIVE';

  return (
    <div className="card overflow-hidden" aria-label="Live product preview">
      <div className="aspect-square bg-surface-low overflow-hidden">
        <img
          src={img}
          alt=""
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.src = FALLBACK; }}
        />
      </div>
      <div className="p-3 space-y-1">
        <div className="font-semibold line-clamp-2 min-h-[2.5rem]">
          {form.name?.trim() || <span className="text-on-surface-variant italic">Product name</span>}
        </div>
        <div className="text-label-md text-on-surface-variant line-clamp-1">
          {form.category?.trim() || <span className="italic">Category</span>}
        </div>
        <div className="flex items-center justify-between pt-1">
          <div className="font-bold text-base">{price}</div>
          {form.stock > 0 ? (
            <span className="chip bg-tertiary-container/20 text-tertiary">
              <Icon name="check_circle" className="text-[14px]" /> In stock
            </span>
          ) : (
            <span className="chip bg-error/10 text-error">
              <Icon name="remove_circle" className="text-[14px]" /> Out
            </span>
          )}
        </div>
        {Array.isArray(form.variants) && form.variants.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1" aria-label={`${form.variants.length} variants`}>
            {form.variants.slice(0, 6).map((v, i) => (
              <span
                key={v.id || `${v.color}-${v.size}-${i}`}
                className="chip bg-surface-low text-on-surface-variant text-[11px] inline-flex items-center gap-1"
                title={`${v.color} / ${v.size} — stock ${v.stock}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full border border-outline-variant/40"
                  style={{ backgroundColor: colorToHex(v.color) }}
                  aria-hidden="true"
                />
                {v.size}
              </span>
            ))}
            {form.variants.length > 6 && (
              <span className="chip bg-surface-low text-on-surface-variant text-[11px]">
                +{form.variants.length - 6}
              </span>
            )}
          </div>
        )}
        <div className="text-label-sm text-on-surface-variant pt-1 flex items-center justify-between">
          <span className="truncate">{vendorName}</span>
          <span className={`chip ${status === 'LIVE' ? 'bg-tertiary-container/20 text-tertiary' : status === 'DRAFT' ? 'bg-secondary/20 text-secondary' : 'bg-error/10 text-error'}`}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}