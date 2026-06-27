// One-shot migration: rewrite every product's imageUrls JSON so it points
// at the bundled SVG set in APP_shopper_and_buyer/public/seed-images/
// instead of picsum.photos (which is unreachable from the Android WebView).
//
// Idempotent — re-running is safe. The script decides the new image array
// from the product's category so the catalog still looks plausible.

const { prisma } = require('../src/prisma');

const SLUG = {
  electronics: 'electronics',
  fashion: 'fashion',
  home: 'home',
  beauty: 'beauty',
  grocery: 'home',
  toys: 'fashion',
  sports: 'home',
  books: 'beauty',
};

function pickSlug(category) {
  if (!category) return 'placeholder';
  const k = String(category).toLowerCase();
  return SLUG[k] || 'placeholder';
}

async function main() {
  const products = await prisma.product.findMany();
  let updated = 0;
  for (const p of products) {
    const slug = pickSlug(p.category);
    const newArr = [`/seed-images/${slug}.svg`];
    const serialized = JSON.stringify(newArr);
    if (p.imageUrls === serialized) continue;
    await prisma.product.update({
      where: { id: p.id },
      data: { imageUrls: serialized },
    });
    updated += 1;
  }
  console.log(`Updated ${updated} of ${products.length} products.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
