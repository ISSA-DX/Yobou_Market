const { z } = require('zod');

const email = z.string().email();
const password = z.string().min(8).max(128);

const registerCustomer = z.object({
  name: z.string().min(1).max(120),
  email,
  password,
});

const login = z.object({
  email,
  password,
});

const vendorRegister = z.object({
  name: z.string().min(1).max(120),
  email,
  password,
  businessName: z.string().min(1).max(200),
  phone: z.string().min(5).max(40),
  licenseUrl: z.string().url().optional(),
  categories: z.array(z.string()).default([]),
});

// One row in a product's color/size variant matrix. Free-text color +
// size (the admin UI offers preset datalists but allows custom values);
// per-row stock; id is present on PATCH (existing row) and absent on
// POST (new row). imageUrls is the per-color photo gallery override —
// empty array means "fall back to the product-level imageUrls" on the
// storefront; populated array swaps the carousel when the shopper picks
// this color.
const variantInput = z.object({
  id: z.string().optional(),
  color: z.string().min(1).max(40),
  size: z.string().min(1).max(40),
  stock: z.number().int().nonnegative().default(0),
  imageUrls: z.array(z.string()).max(10).default([]),
});

// A category pin: a category name (legacy string form) or
// { name, subcategory } for a specific department. See lib/placement.js.
const categoryPin = z.union([
  z.string().max(80),
  z.object({ name: z.string().max(80), subcategory: z.string().max(80).nullable().optional() }),
]);

const productUpsert = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  priceCents: z.number().int().nonnegative(),
  // Optional list/deal price. When set, the storefront shows the
  // strikethrough + "X% off" badge. When null/omitted, no deal is
  // rendered. We enforce compareAt > priceCents as a cross-field
  // invariant so the UI never ends up with a "deal" that isn't
  // actually cheaper than the current price.
  compareAtPriceCents: z.number().int().nonnegative().nullable().optional(),
  category: z.string().min(1).max(80),
  // Optional subcategory within `category`. Empty string / null = none.
  subcategory: z.string().max(80).nullable().optional(),
  imageUrls: z.array(z.string()).default([]),
  stock: z.number().int().nonnegative().default(0),
  status: z.enum(['LIVE', 'DRAFT', 'HIDDEN']).default('LIVE'),
  // Optional color/size variants. When at least one row is provided the
  // server computes Product.stock = sum(variants.stock). When empty,
  // the legacy single stock value is used. Capped at 200 rows per
  // product to guard against oversize bodies.
  variants: z.array(variantInput).max(200).default([]),
  // Placement flags — which shopper surfaces this product should
  // appear on. Defaults: home/deals/search ON, flash OFF. The route
  // handlers (admin POST/PATCH, change approve) write these to the
  // Product row; the public list endpoint filters on them. See
  // server/src/routes/products.js for the read side.
  showOnHome: z.boolean().default(true),
  showOnDeals: z.boolean().default(true),
  showOnFlashDeals: z.boolean().default(false),
  showOnSearch: z.boolean().default(true),
  showOnRecentDeals: z.boolean().default(false),
  showOnNewArrivals: z.boolean().default(true),
  showOnCategorySpotlight: z.boolean().default(false),
  // Extra category / department pages this product also appears on, in
  // addition to its primary category. Normalized server-side
  // (lib/placement.js normalizeExtraCategories).
  extraCategories: z.array(categoryPin).max(10).default([]),
}).refine(
  // A deal is only valid if it's strictly more expensive than the
  // current price. A non-null compareAtPriceCents <= priceCents would
  // either be a no-op (visual bug) or a price hike mislabelled as a
  // discount — reject so the form can correct the input.
  (d) => d.compareAtPriceCents == null || d.compareAtPriceCents > d.priceCents,
  { message: 'compareAtPriceCents must be greater than priceCents', path: ['compareAtPriceCents'] }
);

// Partial form for PATCH /api/products/:id. The cross-field rule
// (compareAt > price) only kicks in when BOTH fields are present in the
// body — otherwise we'd reject a partial update that just sets the
// compareAt without touching the price. The route handler re-validates
// against the live product on vendor-update approval.
const productUpsertPartial = productUpsert.innerType().partial().refine(
  (d) => d.compareAtPriceCents == null
    || d.priceCents == null
    || d.compareAtPriceCents > d.priceCents,
  { message: 'compareAtPriceCents must be greater than priceCents', path: ['compareAtPriceCents'] }
);

const cartAdd = z.object({
  productId: z.string(),
  // Optional. When the product has variants, the shopper's selected
  // (color, size) row is sent so the cart's stock check is per-variant.
  // Null on legacy single-stock products.
  variantId: z.string().nullable().optional(),
  quantity: z.number().int().positive().max(99),
});

const address = z.object({
  recipientName: z.string().min(1).max(120).optional(),
  line1: z.string().min(1).max(300),
  city: z.string().min(1).max(120),
  state: z.string().min(1).max(120),
  postal: z.string().min(1).max(40),
  isDefault: z.boolean().optional(),
});

const MOBILE_MONEY_PROVIDERS = ['MPESA', 'MTN', 'AIRTEL', 'ORANGE', 'MOBICASH', 'ORANGE_MONEY'];

const mobileMoney = z.object({
  provider: z.enum(MOBILE_MONEY_PROVIDERS),
  phone: z.string().min(8).max(20),
  country: z.string().length(2),
});

const mobileMoneyMethodCreate = z.object({
  provider: z.enum(MOBILE_MONEY_PROVIDERS),
  phone: z.string().min(8).max(20),
  country: z.string().length(2),
  isDefault: z.boolean().optional().default(false),
});

const orderCreate = z.object({
  addressId: z.string(),
  paymentMethod: z.enum(['CARD', 'PAYPAL', 'COD', 'MOBILE_MONEY']),
  card: z
    .object({
      number: z.string().min(12).max(25),
      name: z.string().min(1).max(120),
      expiry: z.string().min(4).max(7), // MM/YY
      cvv: z.string().min(3).max(4),
    })
    .optional(),
  // Optional promo code (see lib/coupons.js).
  couponCode: z.string().trim().max(40).optional(),
  mobileMoney: mobileMoney.optional(),
}).refine(
  (data) => data.paymentMethod !== 'CARD' || (data.card && data.card.number && data.card.cvv),
  { message: 'Card details are required for card payments', path: ['card'] }
).refine(
  (data) => data.paymentMethod !== 'MOBILE_MONEY' || data.mobileMoney,
  { message: 'Mobile money details are required for mobile money payments', path: ['mobileMoney'] }
);

const orderStatus = z.object({
  status: z.enum(['PLACED', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
});

// Admin-only cancel: requires a reason and optional stock-restore flag.
const orderCancel = z.object({
  reason: z.string().min(3).max(500),
  restoreStock: z.boolean().optional().default(true),
});

// Ship action: carrier + tracking number + optional ETA. Used by both
// vendor and admin when transitioning to SHIPPED.
const CARRIERS = ['DHL', 'FedEx', 'UPS', 'USPS', 'YobouDirect', 'Other'];
const orderShip = z.object({
  carrier: z.enum(CARRIERS),
  trackingNumber: z.string().min(1).max(100),
  estimatedDelivery: z
    .string()
    .datetime()
    .optional()
    .or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()),
  note: z.string().max(500).optional(),
});

// Vendor submits a product change for admin approval.
// action: CREATE (productId null) | UPDATE (productId required) | DELETE (productId required)
const productChangeCreate = z.object({
  productId: z.string().optional(),
  action: z.enum(['CREATE', 'UPDATE', 'DELETE']),
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  priceCents: z.number().int().nonnegative().optional(),
  // Same deal-price rules as productUpsert, but we can't enforce the
  // "compareAt > price" cross-field rule at parse time because the
  // existing priceCents may be coming from the live product (not in
  // the body). The approve path (server/src/routes/productChanges.js)
  // re-validates against the live product on apply and rejects with
  // a clear error if the rule would be violated.
  compareAtPriceCents: z.number().int().nonnegative().nullable().optional(),
  category: z.string().min(1).max(80).optional(),
  subcategory: z.string().max(80).nullable().optional(),
  imageUrls: z.array(z.string()).optional(),
  stock: z.number().int().nonnegative().optional(),
  status: z.enum(['LIVE', 'DRAFT', 'HIDDEN']).optional(),
  // Vendor's proposed variant snapshot. When present, admin approval
  // applies it; when absent, existing variants (if any) are left alone.
  variants: z.array(variantInput).max(200).optional(),
  // Placement flags. Same null-vs-explicit convention as the other
  // proposed* fields on UPDATE (null = "leave the existing Product
  // value alone"). On CREATE the approve path falls through to the
  // schema defaults when null, so vendors don't have to opt in to
  // publish a new product.
  showOnHome: z.boolean().optional(),
  showOnDeals: z.boolean().optional(),
  showOnFlashDeals: z.boolean().optional(),
  showOnSearch: z.boolean().optional(),
  showOnRecentDeals: z.boolean().optional(),
  showOnNewArrivals: z.boolean().optional(),
  showOnCategorySpotlight: z.boolean().optional(),
  // Additional category pin targets. Server-side normalized on apply.
  extraCategories: z.array(categoryPin).max(10).optional(),
}).refine(
  (d) => d.action === 'CREATE' || !!d.productId,
  { message: 'productId is required for UPDATE/DELETE', path: ['productId'] }
).refine(
  (d) => d.action !== 'CREATE' || (d.name && d.category && d.priceCents !== undefined),
  { message: 'name, category, priceCents are required for CREATE', path: ['name'] }
).refine(
  // On CREATE the body must satisfy the same invariant as productUpsert.
  // For UPDATE the existing priceCents lives on the product row, so we
  // re-check on apply in the route handler.
  (d) => {
    if (d.action !== 'CREATE') return true;
    if (d.compareAtPriceCents == null) return true;
    return typeof d.priceCents === 'number' && d.compareAtPriceCents > d.priceCents;
  },
  { message: 'compareAtPriceCents must be greater than priceCents', path: ['compareAtPriceCents'] }
);

const adminReview = z.object({
  adminNote: z.string().max(1000).optional(),
});

// Customer requests a refund on a delivered order.
const refundCreate = z.object({
  orderId: z.string(),
  reason: z.string().min(3).max(1000),
  amountCents: z.number().int().nonnegative().optional(),
});

// Admin creates an already-approved vendor directly with an initial password.
const adminVendorCreate = z.object({
  name: z.string().min(1).max(120),
  email,
  password,
  businessName: z.string().min(1).max(200),
  phone: z.string().min(5).max(40),
  licenseUrl: z.string().url().optional(),
  categories: z.array(z.string()).default([]),
});

// Vendor updates their own business profile. Empty body is rejected so
// we always emit an audit entry.
const vendorSelfUpdate = z.object({
  businessName: z.string().min(1).max(200).optional(),
  phone: z.string().min(5).max(40).optional(),
  licenseUrl: z.string().url().nullable().optional(),
  categories: z.array(z.string().min(1).max(80)).max(20).optional(),
  logoUrl: z.string().url().nullable().optional(),
  bannerUrl: z.string().url().nullable().optional(),
  description: z.string().max(600).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'no fields to update' });

const categoryCreate = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80).optional(),
});

const categoryUpdate = z.object({
  name: z.string().min(1).max(80).optional(),
  slug: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
  // Editorial content for the shopper category page.
  icon: z.string().max(60).nullable().optional(),
  tagline: z.string().max(160).nullable().optional(),
  description: z.string().max(1200).nullable().optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  guide: z.array(z.object({
    title: z.string().min(1).max(80),
    body: z.string().min(1).max(500),
  })).max(8).optional(),
  faqs: z.array(z.object({
    q: z.string().min(1).max(160),
    a: z.string().min(1).max(600),
  })).max(12).optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'no fields to update' });

const subcategoryCreate = z.object({
  name: z.string().trim().min(1).max(80),
  description: z.string().max(240).default(''),
  icon: z.string().max(60).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});

const guideItems = z.array(z.object({
  title: z.string().min(1).max(80),
  body: z.string().min(1).max(500),
})).max(8);
const faqItems = z.array(z.object({
  q: z.string().min(1).max(160),
  a: z.string().min(1).max(600),
})).max(12);

const subcategoryUpdate = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  description: z.string().max(240).optional(),
  icon: z.string().max(60).nullable().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  isActive: z.boolean().optional(),
  // Department page content.
  heroImageUrl: z.string().max(500).refine((v) => /^https?:\/\//.test(v) || /^\/[A-Za-z0-9/_\-.]+$/.test(v), { message: 'Must be an image URL or an in-app image path' }).nullable().optional(),
  intro: z.string().max(1200).nullable().optional(),
  guide: guideItems.optional(),
  faqs: faqItems.optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'no fields to update' });

// An image reference: a full URL (uploads) or an in-app asset path such
// as /seed-images/demo/x.svg (bundled with every app).
const imageRef = z.string().max(500).refine((v) => /^https?:\/\//.test(v) || /^\/[A-Za-z0-9/_\-.]+$/.test(v), { message: 'Must be an image URL or an in-app image path' });

// Campaign banner (admin). linkUrl must be an in-app path — checked in
// the route with lib/merch.isInternalLink.
const optionalDate = z.union([z.string().datetime({ offset: true }), z.string().date()]).nullable().optional();
const campaignFields = {
  title: z.string().trim().min(1).max(80),
  subtitle: z.string().trim().max(160).nullable().optional(),
  ctaLabel: z.string().trim().min(1).max(30).optional(),
  linkUrl: z.string().trim().min(1).max(300),
  imageUrl: imageRef.nullable().optional(),
  category: z.string().trim().min(1).max(80),
  subcategory: z.string().trim().max(80).nullable().optional(),
  isActive: z.boolean().optional(),
  startsAt: optionalDate,
  endsAt: optionalDate,
  sortOrder: z.number().int().min(0).max(10000).optional(),
};
const campaignCreate = z.object(campaignFields);
const campaignUpdate = z.object({
  ...Object.fromEntries(Object.entries(campaignFields).map(([k, v]) => [k, v.optional()])),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
  reviewNote: z.string().max(300).nullable().optional(),
}).refine((d) => Object.keys(d).length > 0, { message: 'no fields to update' });

// Partner banner request: links to their own store or one of their products.
const vendorCampaignRequest = z.object({
  title: campaignFields.title,
  subtitle: campaignFields.subtitle,
  ctaLabel: campaignFields.ctaLabel,
  imageUrl: campaignFields.imageUrl,
  category: campaignFields.category,
  subcategory: campaignFields.subcategory,
  startsAt: optionalDate,
  endsAt: optionalDate,
  target: z.enum(['store', 'product']),
  productId: z.string().max(80).optional(),
});

const collectionRule = z.object({
  maxPriceCents: z.number().int().positive().max(100000000).nullable().optional(),
  minDiscountPct: z.number().int().min(1).max(95).nullable().optional(),
  inStockOnly: z.boolean().optional(),
  sort: z.enum(['newest', 'price-asc', 'discount']).optional(),
});
const collectionFields = {
  name: z.string().trim().min(1).max(80),
  description: z.string().max(300).optional(),
  category: z.string().trim().min(1).max(80),
  subcategory: z.string().trim().max(80).nullable().optional(),
  mode: z.enum(['MANUAL', 'RULE']),
  productIds: z.array(z.string().max(80)).max(60).optional(),
  rule: collectionRule.optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10000).optional(),
};
const collectionCreate = z.object(collectionFields);
const collectionUpdate = z.object(
  Object.fromEntries(Object.entries(collectionFields).map(([k, v]) => [k, v.optional()])),
).refine((d) => Object.keys(d).length > 0, { message: 'no fields to update' });

// Review payload submitted by a customer. rating is the only numeric
// field; title is the headline shown in the list, body is the long
// text. The 1..5 range and the size caps are the only hard rules —
// profanity / moderation is out of scope for this iteration.
const reviewCreate = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(2000),
});

// Query string for the public review list. `rating` filters the list
// down to a single histogram bucket (the user clicked a bar). `sort`
// is the obvious three: most recent, highest first, lowest first.
// `offset` is capped to keep the deep-pagination scan bounded.
const reviewListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
  sort: z.enum(['recent', 'highest', 'lowest']).default('recent'),
  rating: z.coerce.number().int().min(1).max(5).optional(),
});

// Query string for the public product list (GET /api/products).
// `category` is the existing exact-string match on Product.category.
// `q` is a contains search across name + category + description.
// The four showOn* filters let the admin preview a specific surface
// and (eventually) let the shopper pick "show only on flash" / etc.
// All four default to "no filter" (null = skip the predicate).
// Query-string booleans need explicit coercion: z.coerce.boolean() would
// turn 'false' into true (Boolean('false') === true), which would make
// `?showOnHome=false` match products with showOnHome: true. This preprocessor
// accepts the common truthy/falsy spellings and rejects anything else so the
// route's where-clause can rely on the parsed value.
const queryBool = z.preprocess((v) => {
  if (typeof v === 'boolean') return v;
  if (typeof v !== 'string') return v;
  const s = v.toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return v; // z.boolean() below will reject
}, z.boolean());

const SORT_VALUES = ['featured', 'price-asc', 'price-desc', 'name-asc', 'newest'];

// Phase-0 storefront search + faceted filter query schema.
// `vendor` accepts a vendor id (cuid). `minPrice`/`maxPrice` are cents.
// `inStock` borrows the `queryBool` preprocessor so 'true'/'false'/'1'/'0'
// all coerce consistently. `pageSize` caps at 60 to keep payloads bounded;
// `limit` is a legacy alias kept for the unfiltered lists on the home page
// (default 60) — the route handler picks the effective page size from
// pageSize ?? limit ?? 60 in that priority order.
const productListQuery = z.object({
  q: z.string().min(1).max(200).optional(),
  category: z.string().min(1).max(80).optional(),
  subcategory: z.string().min(1).max(80).optional(),
  vendor: z.string().min(1).max(80).optional(),
  minPrice: z.coerce.number().int().min(0).max(100000000).optional(),
  maxPrice: z.coerce.number().int().min(0).max(100000000).optional(),
  inStock: queryBool.optional(),
  sort: z.enum(SORT_VALUES).default('featured'),
  page: z.coerce.number().int().min(1).max(1000).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  showOnHome: queryBool.optional(),
  showOnDeals: queryBool.optional(),
  showOnFlashDeals: queryBool.optional(),
  showOnSearch: queryBool.optional(),
  showOnRecentDeals: queryBool.optional(),
  showOnNewArrivals: queryBool.optional(),
  showOnCategorySpotlight: queryBool.optional(),
}).refine(
  (d) => d.minPrice == null || d.maxPrice == null || d.minPrice <= d.maxPrice,
  { message: 'minPrice must be <= maxPrice', path: ['minPrice'] }
);

module.exports = {
  registerCustomer,
  login,
  vendorRegister,
  vendorSelfUpdate,
  productUpsert,
  productUpsertPartial,
  productChangeCreate,
  variantInput,
  adminReview,
  refundCreate,
  adminVendorCreate,
  cartAdd,
  address,
  orderCreate,
  orderStatus,
  orderCancel,
  orderShip,
  CARRIERS,
  categoryCreate,
  categoryUpdate,
  subcategoryCreate,
  subcategoryUpdate,
  campaignCreate,
  campaignUpdate,
  vendorCampaignRequest,
  collectionCreate,
  collectionUpdate,
  reviewCreate,
  reviewListQuery,
  productListQuery,
  MOBILE_MONEY_PROVIDERS,
  mobileMoney,
  mobileMoneyMethodCreate,
};
