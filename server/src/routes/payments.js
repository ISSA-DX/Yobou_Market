const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth } = require('../auth/middleware');
const stripeLib = require('../lib/stripe');

const router = express.Router();

function detectBrand(number) {
  const n = number.replace(/\s/g, '');
  if (/^4/.test(n)) return 'visa';
  if (/^5[1-5]/.test(n) || /^2[2-7]/.test(n)) return 'mastercard';
  if (/^3[47]/.test(n)) return 'amex';
  if (/^6(?:011|5)/.test(n)) return 'discover';
  return 'card';
}

const cardCreate = z.object({
  number: z.string().min(12).max(25),
  name: z.string().min(1).max(120),
  expiry: z.string().regex(/^\d{2}\/\d{2}$/),
  cvv: z.string().min(3).max(4),
  isDefault: z.boolean().optional().default(false),
});

// ──────────────────────────────────────────────────────────────────
// Phase-0 Stripe real-money path.
//
// The existing paymentSimulator still handles dev / no-keys checkouts
// in server/src/routes/orders.js (the simulator is called there on
// order create). This module adds the BUILDING BLOCKS the real-money
// branch will plug into:
//   - /api/payments/intent  — auth required; mints a PaymentIntent
//     tied to an existing PLACED order, returns client_secret for
//     the client-side Stripe.js confirm step.
//   - /api/payments/webhook — no auth; mounted on the app BEFORE
//     express.json() (see server/src/index.js) so the raw body is
//     available for Stripe signature verification. Marks the order
//     PAID on payment_intent.succeeded events and is idempotent so
//     retry deliveries can't double-credit.
// ──────────────────────────────────────────────────────────────────

const intentBody = z.object({
  orderId: z.string(),
});

// Auth is mounted inline on the /intent route itself, NOT via the
// `router.use(requireAuth)` block at the bottom — the latter applies to
// the PaymentMethod CRUD endpoints only. Order matters: callers must
// prove they own the order (and that the order is in a state that
// admits a fresh PaymentIntent) BEFORE we spend a network call on
// Stripe. Ordering also makes the 404 / 403 / 409 paths reachable
// even when the gateway key isn't configured, which is what the
// tests rely on.
router.post('/intent', requireAuth, async (req, res, next) => {
  try {
    const { orderId } = intentBody.parse(req.body);
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) return res.status(404).json({ error: 'NOT_FOUND' });
    if (order.userId !== req.user.id) return res.status(403).json({ error: 'FORBIDDEN' });
    if (order.status !== 'PLACED') {
      return res.status(409).json({
        error: 'INVALID_STATE',
        message: `Order is ${order.status}, cannot create a fresh PaymentIntent`,
      });
    }
    if (!stripeLib.isStripeConfigured()) {
      return res.status(503).json({
        error: 'STRIPE_NOT_CONFIGURED',
        message: 'Stripe is not configured in this environment. Set STRIPE_SECRET_KEY in server/.env.',
      });
    }
    const intent = await stripeLib.createPaymentIntent({
      amountCents: order.totalCents,
      currency: (req.user.currency || 'usd').toLowerCase(),
      metadata: { orderId: order.id, userId: req.user.id },
      // Idempotency key prevents Stripe from creating duplicate
      // intents if the client retries the /intent call after a
      // network blip. PaymentIntents.x.id is also stable per
      // (order, retry). See https://docs.stripe.com/api/idempotent_requests.
      idempotencyKey: `order:${order.id}:intent`,
    });
    res.json({
      clientSecret: intent.client_secret,
      paymentIntentId: intent.id,
      amountCents: order.totalCents,
      currency: (req.user.currency || 'usd').toLowerCase(),
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Stripe webhook handler. Mounted directly on the app
// (server/src/index.js) with express.raw({type:'application/json'})
// BEFORE the global express.json() middleware, so req.body here is
// the EXACT bytes Stripe signed. DO NOT move this handler behind an
// app.use(express.json()) call.
async function webhookHandler(req, res, next) {
  try {
    const sig = req.headers['stripe-signature'];
    const event = stripeLib.verifyWebhook({ payload: req.body, signature: sig });
    if (event.type === 'payment_intent.succeeded') {
      const intent = event.data.object;
      const orderId = intent.metadata && intent.metadata.orderId;
      if (orderId) {
        // Idempotent: retried webhook deliveries are common during
        // outages. If the order is already PAID we no-op so the
        // paymentTxnId record and timeline stay stable.
        const order = await prisma.order.findUnique({ where: { id: orderId } });
        if (order && order.status === 'PLACED') {
          await prisma.order.update({
            where: { id: orderId },
            data: { status: 'PAID', paymentTxnId: intent.id },
          });
        }
      }
    }
    res.json({ received: true });
  } catch (err) {
    // Verification failure: Stripe signature didn't match what we
    // know. Either bad secret, replayed event, or malformed payload.
    // All three are security-relevant. Don't echo the underlying
    // error message; just log and 400.
    console.warn('[stripe-webhook] verification failed:', err.code || err.message);
    res.status(400).json({ error: 'INVALID_SIGNATURE' });
  }
}

// Auth-gated routes (PaymentMethod CRUD) come AFTER the public /intent
// route so the intent endpoint doesn't require auth below the wallet
// user — auth is enforced INSIDE the /intent handler.
router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const methods = await prisma.paymentMethod.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }, { id: 'asc' }],
    });
    res.json({ methods });
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const data = cardCreate.parse(req.body);
    const [expiryMonth, expiryYear] = data.expiry.split('/');
    const brand = detectBrand(data.number);
    const last4 = data.number.replace(/\s/g, '').slice(-4);

    if (data.isDefault) {
      await prisma.paymentMethod.updateMany({
        where: { userId: req.user.id },
        data: { isDefault: false },
      });
    }

    const method = await prisma.paymentMethod.create({
      data: {
        userId: req.user.id,
        type: 'CARD',
        brand,
        last4,
        expiryMonth,
        expiryYear,
        isDefault: data.isDefault,
      },
    });

    res.status(201).json({ method });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

router.patch('/:id/default', async (req, res, next) => {
  try {
    await prisma.$transaction([
      prisma.paymentMethod.updateMany({ where: { userId: req.user.id }, data: { isDefault: false } }),
      prisma.paymentMethod.update({ where: { id: req.params.id, userId: req.user.id }, data: { isDefault: true } }),
    ]);
    const methods = await prisma.paymentMethod.findMany({
      where: { userId: req.user.id },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
    res.json({ methods });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'NOT_FOUND' });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await prisma.paymentMethod.delete({ where: { id: req.params.id, userId: req.user.id } });
    res.json({ ok: true });
  } catch (err) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'NOT_FOUND' });
    next(err);
  }
});

// Expose the webhook handler so server/src/index.js can mount it on
// the app with express.raw() before the global json parser.
router.webhookHandler = webhookHandler;

module.exports = router;
