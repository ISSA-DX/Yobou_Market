import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';

/**
 * Horizontal scroll section with a header and a row of product cards.
 * - `products` is an array of product objects.
 * - `title` / `action` / `actionTo` drive the section header.
 * - `skeletonCount` controls how many skeletons to show while loading.
 * - `badge` is passed down to each ProductCard.
 */
export default function ProductRow({
  title,
  icon,
  action = 'See all',
  actionTo,
  products = [],
  loading,
  skeletonCount = 4,
  onAdd,
  badge,
  cardWidth = 'min-w-[170px] sm:min-w-[200px]',
}) {
  const showHeader = title || actionTo;

  return (
    <section className="relative -mx-4">
      {showHeader && (
        <div className="px-4 flex items-center justify-between mb-3">
          <h2 className="text-headline-md font-bold flex items-center gap-2">
            {icon && <Icon name={icon} className="text-secondary" />}
            {title}
          </h2>
          {actionTo ? (
            <Link to={actionTo} className="text-sm text-primary font-semibold flex items-center gap-0.5">
              {action} <Icon name="chevron_right" className="text-[18px]" />
            </Link>
          ) : null}
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto no-scrollbar scroll-smooth snap-x snap-mandatory px-4 pb-1 min-h-[280px]">
        {loading ? (
          <>
            {Array.from({ length: skeletonCount }).map((_, i) => (
              <div key={i} className={cardWidth}>
                <ProductCardSkeleton />
              </div>
            ))}
          </>
        ) : products.length > 0 ? (
          products.map((p) => (
            <div key={p.id} className={`snap-start ${cardWidth}`}>
              <ProductCard product={p} onAdd={onAdd} badge={badge} />
            </div>
          ))
        ) : (
          <div className="px-4 py-4">
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-surface-high text-on-surface-variant text-sm">
              <Icon name="info" className="text-[16px]" />
              Nothing in this section right now.
            </span>
          </div>
        )}
      </div>

      {/* Right-edge fade hinting there is more to scroll. */}
      {products.length > 2 && (
        <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-gradient-to-l from-surface to-transparent" />
      )}
    </section>
  );
}
