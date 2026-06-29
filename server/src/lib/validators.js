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

const productUpsert = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).default(''),
  priceCents: z.number().int().nonnegative(),
  category: z.string().min(1).max(80),
  imageUrls: z.array(z.string()).default([]),
  stock: z.number().int().nonnegative().default(0),
  status: z.enum(['LIVE', 'DRAFT', 'HIDDEN']).default('LIVE'),
});

const cartAdd = z.object({
  productId: z.string(),
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

const orderCreate = z.object({
  addressId: z.string(),
  paymentMethod: z.enum(['CARD', 'PAYPAL', 'COD']),
  card: z
    .object({
      number: z.string().min(12).max(25),
      name: z.string().min(1).max(120),
      expiry: z.string().min(4).max(7), // MM/YY
      cvv: z.string().min(3).max(4),
    })
    .optional(),
}).refine(
  (data) => data.paymentMethod !== 'CARD' || (data.card && data.card.number && data.card.cvv),
  { message: 'Card details are required for card payments', path: ['card'] }
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
  category: z.string().min(1).max(80).optional(),
  imageUrls: z.array(z.string()).optional(),
  stock: z.number().int().nonnegative().optional(),
  status: z.enum(['LIVE', 'DRAFT', 'HIDDEN']).optional(),
}).refine(
  (d) => d.action === 'CREATE' || !!d.productId,
  { message: 'productId is required for UPDATE/DELETE', path: ['productId'] }
).refine(
  (d) => d.action !== 'CREATE' || (d.name && d.category && d.priceCents !== undefined),
  { message: 'name, category, priceCents are required for CREATE', path: ['name'] }
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
}).refine((d) => Object.keys(d).length > 0, { message: 'no fields to update' });

module.exports = {
  registerCustomer,
  login,
  vendorRegister,
  vendorSelfUpdate,
  productUpsert,
  productChangeCreate,
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
};