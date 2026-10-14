// Simulated payment processor.
// Realistic surface — same shape a Stripe/PayPal integration would return.
// To swap in real providers, replace this file with calls to the live SDKs.

const { initiate: initiateMobileMoney } = require('./mobileMoney');

const DECLINE_RATE = Number(process.env.PAYMENT_DECLINE_RATE ?? 0.05);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newTxnId(method) {
  return `sim_${method.toLowerCase()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function pay({ method, amountCents, card, mobileMoney }) {
  await sleep(600); // feel of a real round-trip

  if (!method || !['CARD', 'PAYPAL', 'COD', 'MOBILE_MONEY'].includes(method)) {
    return { ok: false, reason: 'UNKNOWN_METHOD' };
  }

  // COD always "succeeds" — money changes hands on delivery.
  if (method === 'COD') {
    return { ok: true, txnId: newTxnId('cod'), method, amountCents };
  }

  // Mobile money: route to the provider simulator. The order stays PLACED
  // while the customer approves the prompt on their phone.
  if (method === 'MOBILE_MONEY') {
    const result = await initiateMobileMoney({
      provider: mobileMoney.provider,
      phone: mobileMoney.phone,
      country: mobileMoney.country,
      amountCents,
      orderId: mobileMoney.orderId,
    });
    return {
      ok: result.ok,
      txnId: result.providerTxnId || null,
      method,
      amountCents,
      status: result.status,
      reason: result.reason,
      maskedPhone: result.maskedPhone,
    };
  }

  // Random simulated decline for cards (configurable via PAYMENT_DECLINE_RATE).
  if (method === 'CARD') {
    if (!card || !card.number || !card.expiry || !card.cvv) {
      return { ok: false, reason: 'INCOMPLETE_CARD' };
    }
    if (Math.random() < DECLINE_RATE) {
      return { ok: false, reason: 'DECLINED' };
    }
    return { ok: true, txnId: newTxnId('card'), method, amountCents };
  }

  // PayPal simulated — always succeeds.
  return { ok: true, txnId: newTxnId('paypal'), method, amountCents };
}

module.exports = { pay };