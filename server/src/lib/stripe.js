// Stripe SDK wrapper.
//
// Phase-0 scaffolding: we don't wire Stripe into the order-creation
// flow yet (the existing paymentSimulator still handles dev / no-keys
// checkouts). This module wires up the BUILDING BLOCKS so adding the
// "real money" branch on top of the existing flow is a small later
// patch:
//   - isStripeConfigured() lets a route fast-path to a 503 response
//     in dev environments without a Stripe account.
//   - createPaymentIntent() is what the checkout UI will call after
//     the order is created, to mint the PaymentIntent whose
//     client_secret the client-side Stripe.js mounts and confirms.
//   - verifyWebhook() is what /api/payments/webhook uses to convert
//     the raw request body (Express MUST see the raw bytes — JSON
//     parsing breaks signature verification) into a typed event.
//
// WHY the lazy singleton below:
//   - Don't `new Stripe(...)` at module-load time. That would
//     crash the dev process on import even when the SDK is never
//     used. Instead, instantiate on first call and only when a key
//     is set. The cache survives across calls so we don't leak
//     sockets.
//   - Don't prep-package the SDK when no key is configured. Calling
//     isStripeConfigured() should be a cheap env-only check, not a
//     fetch across the network. Tests rely on this.

let _client = null;

function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function getClient() {
  if (_client) return _client;
  if (!process.env.STRIPE_SECRET_KEY) {
    const err = new Error('STRIPE_NOT_CONFIGURED: set STRIPE_SECRET_KEY to enable Stripe payments');
    err.code = 'STRIPE_NOT_CONFIGURED';
    throw err;
  }
  // eslint-disable-next-line global-require
  const Stripe = require('stripe');
  // Pin a stable API version so updates don't silently change behavior
  // on the server. Bump deliberately when you intend to.
  _client = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-06-20' });
  return _client;
}

async function createPaymentIntent({ amountCents, currency = 'usd', metadata = {}, idempotencyKey } = {}) {
  const client = getClient();
  return client.paymentIntents.create({
    amount: Number(amountCents),
    currency: String(currency).toLowerCase(),
    metadata,
    automatic_payment_methods: { enabled: true },
  }, idempotencyKey ? { idempotencyKey } : undefined);
}

function verifyWebhook({ payload, signature, secret } = {}) {
  const client = getClient();
  const useSecret = secret || process.env.STRIPE_WEBHOOK_SECRET;
  if (!useSecret) {
    const err = new Error('STRIPE_WEBHOOK_SECRET not configured');
    err.code = 'WEBHOOK_NOT_CONFIGURED';
    throw err;
  }
  // Stripe's webhook verification requires the EXACT raw bytes the
  // server received — anything other than this (a JSON.parse'd object,
  // a re-stringified buffer, etc.) will produce a different signature
  // than the one the client signed and Stripe will reject the event.
  return client.webhooks.constructEvent(payload, signature, useSecret);
}

module.exports = { isStripeConfigured, createPaymentIntent, verifyWebhook };
