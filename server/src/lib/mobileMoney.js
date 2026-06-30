/**
 * Mobile-money payment simulator.
 *
 * SECURITY NOTE: this file deliberately does NOT accept PINs, OTPs, or
 * provider API secrets from the client. A real provider integration should:
 *   - store API credentials in environment variables only
 *   - sign and verify provider webhooks with a shared secret
 *   - never log full phone numbers or transaction secrets
 *   - encrypt phone numbers at rest
 *
 * The simulator returns the same shape a live M-Pesa / MTN MoMo gateway
 * would return, so the rest of the order flow stays unchanged when you swap
 * in a real SDK.
 */

const crypto = require('crypto');

const MOBILE_MONEY_PROVIDERS = new Set(['MPESA', 'MTN', 'AIRTEL', 'ORANGE']);

// Simulation failure rate, configurable via env. In production this should be 0
// and real provider responses should drive the status.
const SIM_FAILURE_RATE = Number(process.env.MOBILE_MONEY_SIM_FAILURE_RATE ?? 0.05);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function maskPhone(phone) {
  const digits = String(phone).replace(/\D/g, '');
  if (digits.length <= 4) return digits;
  return '*'.repeat(digits.length - 4) + digits.slice(-4);
}

function makeTxnId(provider) {
  return `mm_${provider.toLowerCase()}_${crypto.randomBytes(8).toString('hex')}`;
}

/**
 * Initiate a mobile-money payment.
 * @param {Object} opts
 * @param {string} opts.provider - MPESA | MTN | AIRTEL | ORANGE
 * @param {string} opts.phone - customer phone number
 * @param {string} opts.country - ISO country code, e.g. KE
 * @param {number} opts.amountCents
 * @param {string} opts.orderId
 * @returns {Object} provider response shape { ok, providerTxnId, status, maskedPhone }
 */
async function initiate({ provider, phone, country, amountCents, orderId }) {
  const p = String(provider).toUpperCase();
  if (!MOBILE_MONEY_PROVIDERS.has(p)) {
    return { ok: false, status: 'FAILED', reason: 'UNKNOWN_PROVIDER' };
  }
  if (!phone || String(phone).replace(/\D/g, '').length < 8) {
    return { ok: false, status: 'FAILED', reason: 'INVALID_PHONE' };
  }
  if (!country || country.length !== 2) {
    return { ok: false, status: 'FAILED', reason: 'INVALID_COUNTRY' };
  }

  // Simulate provider round-trip.
  await sleep(800);

  const providerTxnId = makeTxnId(p);
  const maskedPhone = maskPhone(phone);

  // Random simulated failure for dev/testing (never in real provider path).
  if (Math.random() < SIM_FAILURE_RATE) {
    return {
      ok: false,
      status: 'FAILED',
      reason: 'PROVIDER_DECLINED',
      providerTxnId,
      maskedPhone,
    };
  }

  return {
    ok: true,
    status: 'PENDING',
    reason: null,
    providerTxnId,
    maskedPhone,
  };
}

/**
 * Simulate a provider callback. In production this endpoint MUST verify a
 * webhook signature using MOBILE_MONEY_WEBHOOK_SECRET before trusting status.
 */
function verifyCallbackSignature(payload, signature, secret) {
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  // Use timing-safe compare to avoid leaking signature validity.
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

module.exports = {
  initiate,
  maskPhone,
  verifyCallbackSignature,
  MOBILE_MONEY_PROVIDERS,
};
