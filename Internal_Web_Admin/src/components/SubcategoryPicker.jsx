// SubcategoryPicker
// ---------------------------------------------------------------------------
// Second-level picker shown under the CategoryPicker on the product form.
// Lists the admin-curated subcategories of the selected category (from
// GET /api/categories, which embeds them). Optional: "None" keeps the
// product at category level only.
//
// Kept identical in Internal_Web_Admin and Partner_Web_Vendor by copy,
// like CategoryPicker.
import { useMemo } from 'react';
import { useApi } from '../useApi';
import { useProductLiveSync } from '../lib/useProductLiveSync';
import Icon from './Icon';

export default function SubcategoryPicker({ category, value, onChange, id, error }) {
  const { data, refetch } = useApi('/api/categories');
  useProductLiveSync(refetch, { alsoCategories: true });

  const subs = useMemo(() => {
    const cat = (data?.categories || []).find((c) => c.name === category);
    return (cat?.subcategories || []).filter((s) => s.isActive !== false);
  }, [data, category]);

  // A product may carry a subcategory that has since been archived —
  // keep it selectable so saving the form doesn't silently drop it.
  const orphan = value && !subs.some((s) => s.name === value);
  const disabled = !category || (subs.length === 0 && !orphan);

  return (
    <>
      <div className="relative mt-1">
        <select
          id={id}
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          aria-invalid={Boolean(error) || undefined}
          className={`w-full appearance-none px-3 py-2 pr-9 rounded-md border bg-white text-left disabled:bg-surface-low disabled:text-on-surface-variant ${error ? 'border-error' : 'border-outline-variant'}`}
        >
          <option value="">
            {!category ? 'Choose a category first' : subs.length === 0 && !orphan ? 'No subcategories yet' : 'None — category only'}
          </option>
          {subs.map((s) => (
            <option key={s.id} value={s.name}>
              {s.name}{s.productCount != null ? ` (${s.productCount})` : ''}
            </option>
          ))}
          {orphan && <option value={value}>{value} (archived)</option>}
        </select>
        <Icon name="expand_more" className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[20px] text-on-surface-variant" />
      </div>
      <div className="text-label-sm text-on-surface-variant mt-1">
        {subs.length > 0
          ? 'Helps shoppers find this product on the category page.'
          : category ? 'This category has no subcategories.' : ''}
      </div>
    </>
  );
}
