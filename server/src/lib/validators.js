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

module.exports = {
  registerCustomer,
  login,
  vendorRegister,
  productUpsert,
  productChangeCreate,
  adminReview,
  refundCreate,
  adminVendorCreate,
  cartAdd,
  address,
  orderCreate,
  orderStatus,
};