// ProductPreviewCard — mirrors what the shopper sees in the catalog
// grid. Used on the admin product form so the operator sees the
// "as-published" rendering live as they type.
//
// The card intentionally reuses the same data shape as
// APP_shopper_and_buyer/src/components/ProductCard.jsx (image, name,
// price, vendor pill, category) so what the admin sees matches what
// the customer gets. The only difference is the price currency prefix
// is hard-coded "$" since the admin panel currently doesn't expose
// multi-currency.
import Icon from './Icon';
import { productImage } from '../lib/productImage';

const FALLBACK = `${import.meta.env.BASE_URL || '/'}seed-images/placeholder.svg`;

export default function ProductPreviewCard({ form, vendorName }) {
  // Lightweight "fake product" object — matches the shape productImage
  // expects (imageUrls may be string|array|null per productImage.parseImages).
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
        <div className="text-label-sm text-on-surface-variant pt-1 flex items-center justify-between">
          <span>{vendorName || 'Yobou Direct'}</span>
          <span className={`chip ${status === 'LIVE' ? 'bg-tertiary-container/20 text-tertiary' : status === 'DRAFT' ? 'bg-secondary/20 text-secondary' : 'bg-error/10 text-error'}`}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}