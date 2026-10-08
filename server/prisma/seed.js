// Demo seed data — see README for credentials.
// Run: npm run seed (from repo root) or node prisma/seed.js (from server/).

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const USERS = [
  { email: 'admin@yobou.test', name: 'Yobou Admin', password: 'Admin123!', role: 'ADMIN' },
  { email: 'shopper@yobou.test', name: 'Demo Shopper', password: 'Shopper123!', role: 'CUSTOMER' },
  { email: 'vendor1@yobou.test', name: 'Acme Goods', password: 'Vendor123!', role: 'VENDOR', vendor: { businessName: 'Acme Goods', phone: '+1-555-0101', status: 'APPROVED' } },
  { email: 'vendor2@yobou.test', name: 'Pending Partner', password: 'Vendor123!', role: 'VENDOR', vendor: { businessName: 'Pending Partner Co', phone: '+1-555-0102', status: 'PENDING' } },
];

// Curated product categories that ship with every fresh install. This
// is the canonical list both the admin/partner pickers and the
// customer storefront rely on — when an admin adds a new product
// they pick from this list (or click "Other" to add a brand-new one).
// Backfills (boot + the admin-only POST /api/categories/backfill
// endpoint) use the same array, so live databases that pre-date this
// expanded set get promoted to it on the next restart.
//
// `Pharmacy` is intentionally absent — health/medicine needs
// regulatory review before we ship it.
const CATEGORIES = [
  'Electronics', 'Phones', 'Computer', 'Fashion', 'Shoes', 'Beauty',
  'Home', 'Kitchen', 'Sports', 'Fitness', 'Toys', 'Gaming',
  'TV & Audio', 'Appliances', 'Automotive', 'Books', 'Grocery',
  'Health', 'Pet Supplies', 'Baby', 'Jewelry', 'Watches', 'Bags',
  'Office', 'Garden', 'Tools', 'Arts & Crafts', 'Musical Instruments',
];

const PRODUCTS = [
  { name: 'Wireless Earbuds Pro', priceCents: 4999, category: 'Electronics', description: 'Active noise-cancelling earbuds with 30-hour battery life.' },
  { name: 'Smart Watch X3', priceCents: 12999, category: 'Electronics', description: 'AMOLED display, heart-rate monitor, 7-day battery.' },
  { name: '4K Action Camera', priceCents: 18999, category: 'Electronics', description: 'Waterproof to 30m, hyper-smooth stabilization.' },
  { name: 'Linen Summer Shirt', priceCents: 3499, category: 'Fashion', description: 'Breathable linen, relaxed fit, three colors.' },
  { name: 'Canvas Tote Bag', priceCents: 2499, category: 'Fashion', description: 'Heavyweight canvas, 12L capacity.' },
  { name: 'Slim Fit Chinos', priceCents: 4999, category: 'Fashion', description: 'Stretch cotton blend, machine washable.' },
  { name: 'Aroma Diffuser', priceCents: 2999, category: 'Home', description: 'Ultrasonic, 7-color mood light, 8-hour runtime.' },
  { name: 'Cast Iron Skillet 10"', priceCents: 3999, category: 'Home', description: 'Pre-seasoned, lifetime guarantee.' },
  { name: 'Memory Foam Pillow', priceCents: 4499, category: 'Home', description: 'Contoured support, cooling gel layer.' },
  { name: 'Vitamin C Serum', priceCents: 1999, category: 'Beauty', description: '20% L-ascorbic acid, vegan, fragrance-free.' },
  { name: 'Mineral Sunscreen SPF50', priceCents: 1799, category: 'Beauty', description: 'Reef-safe, non-comedogenic, 50ml.' },
  { name: 'Rose Clay Face Mask', priceCents: 1499, category: 'Beauty', description: 'Detoxifying, kaolin + bentonite, 100g.' },
];

// Local SVGs in APP_shopper_and_buyer/public/seed-images — bundled into
// the Android assets at `cap sync` time, so the WebView reaches them offline
// https://localhost/seed-images/<category>.svg. No network needed.
const IMG = (category, i) =>
  JSON.stringify([
    `/seed-images/${category.toLowerCase()}.svg`,
    `/seed-images/${category.toLowerCase()}.svg#${i}`,
  ]);

async function main() {
  console.log('Seeding…');

  // Wipe (order matters because of FKs).
  await prisma.notification.deleteMany();
  await prisma.sseConnection.deleteMany();
  await prisma.adminAuditLog.deleteMany();
  await prisma.timelineEvent.deleteMany();
  await prisma.refund.deleteMany();
  await prisma.orderItem.deleteMany();
  await prisma.order.deleteMany();
  await prisma.cartItem.deleteMany();
  await prisma.productChange.deleteMany();
  await prisma.product.deleteMany();
  await prisma.address.deleteMany();
  await prisma.vendor.deleteMany();
  await prisma.user.deleteMany();

  const created = {};
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 12);
    const user = await prisma.user.create({
      data: {
        email: u.email,
        name: u.name,
        passwordHash,
        role: u.role,
        vendor: u.vendor
          ? { create: { ...u.vendor, approvedAt: u.vendor.status === 'APPROVED' ? new Date() : null } }
          : undefined,
      },
      include: { vendor: true },
    });
    created[u.email] = user;
  }

  // Products — split: first 8 belong to vendor1, last 4 are admin-uploaded (Yobou Direct).
  const vendor1 = created['vendor1@yobou.test'].vendor;
  for (let i = 0; i < PRODUCTS.length; i++) {
    const p = PRODUCTS[i];
    await prisma.product.create({
      data: {
        name: p.name,
        description: p.description,
        priceCents: p.priceCents,
        category: p.category,
        imageUrls: IMG(p.category, i + 1),
        stock: 50,
        status: 'LIVE',
        vendorId: i < 8 ? vendor1.id : null,
      },
    });
  }

  // Curated Category table — the admin/partner Add Product pickers
  // read from this list via GET /api/categories. We upsert the four
  // seed categories so the dropdown is non-empty after seeding. Using
  // upsert (not create) makes the function idempotent — re-running the
  // seed does not throw on the second pass.
  for (const name of CATEGORIES) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, slug: name.toLowerCase(), isActive: true },
    });
  }

  // One default shipping address for the shopper.
  await prisma.address.create({
    data: {
      userId: created['shopper@yobou.test'].id,
      line1: '221B Baker Street',
      city: 'London',
      state: 'Greater London',
      postal: 'NW1 6XE',
      isDefault: true,
    },
  });

  // Two sample orders so the tracking page has real data.
  const shopper = created['shopper@yobou.test'];
  const allProducts = await prisma.product.findMany();
  const addr = await prisma.address.findFirst({ where: { userId: shopper.id } });

  const buildOrder = async ({ status, timeline, paymentMethod, daysAgo }) => {
    const product = allProducts[0];
    const totalCents = product.priceCents;
    const created = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    return prisma.order.create({
      data: {
        userId: shopper.id,
        addressId: addr.id,
        totalCents,
        paymentMethod,
        paymentTxnId: paymentMethod === 'COD' ? null : `sim_seed_${Math.random().toString(36).slice(2, 10)}`,
        status,
        items: { create: [{ productId: product.id, quantity: 1, priceCents: product.priceCents }] },
        timeline: { create: timeline.map((s, i) => ({ status: s, at: new Date(created.getTime() + i * 12 * 60 * 60 * 1000) })) },
      },
    });
  };

  await buildOrder({
    status: 'DELIVERED',
    timeline: ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'],
    paymentMethod: 'CARD',
    daysAgo: 10,
  });
  await buildOrder({
    status: 'SHIPPED',
    timeline: ['PLACED', 'PAID', 'PROCESSING', 'SHIPPED'],
    paymentMethod: 'PAYPAL',
    daysAgo: 2,
  });

  // One PENDING refund request on the delivered order so the admin Refunds page has content.
  const delivered = await prisma.order.findFirst({
    where: { userId: shopper.id, status: 'DELIVERED' },
  });
  if (delivered) {
    await prisma.refund.create({
      data: {
        orderId: delivered.id,
        requestedById: shopper.id,
        reason: 'Item arrived damaged; would like a full refund.',
        amountCents: delivered.totalCents,
        status: 'PENDING',
      },
    });
  }

  // One PENDING product change so the admin Changes page has content.
  const vendor1ForChange = created['vendor1@yobou.test'].vendor;
  const firstVendorProduct = await prisma.product.findFirst({
    where: { vendorId: vendor1ForChange.id },
    orderBy: { createdAt: 'asc' },
  });
  if (firstVendorProduct) {
    await prisma.productChange.create({
      data: {
        vendorId: vendor1ForChange.id,
        productId: firstVendorProduct.id,
        action: 'UPDATE',
        proposedName: firstVendorProduct.name,
        proposedDescription: 'Refreshed description: now with longer battery and improved ANC.',
        proposedPriceCents: Math.max(0, firstVendorProduct.priceCents - 500),
        proposedCategory: firstVendorProduct.category,
        proposedImageUrls: firstVendorProduct.imageUrls,
        proposedStock: firstVendorProduct.stock + 25,
        proposedStatus: firstVendorProduct.status,
        status: 'PENDING',
      },
    });
  }

  console.log('Seed complete.');
  console.log('Demo accounts:');
  console.log('  admin   admin@yobou.test     / Admin123!');
  console.log('  vendor  vendor1@yobou.test   / Vendor123!   (approved)');
  console.log('  vendor  vendor2@yobou.test   / Vendor123!   (pending)');
  console.log('  buyer   shopper@yobou.test   / Shopper123!');
  console.log('Seed also includes 1 PENDING product change and 1 PENDING refund for demo of admin queues.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());