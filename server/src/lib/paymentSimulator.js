// Simulated payment processor.
// Realistic surface — same shape a Stripe/PayPal integration would return.
// To swap in real providers, replace this file with calls to the live SDKs.

const DECLINE_RATE = Number(process.env.PAYMENT_DECLINE_RATE ?? 0.05);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function newTxnId(method) {
  return `sim_${method.toLowerCase()}_${Math.random().toString(36).slice(2, 10)}`;
}

async function pay({ method, amountCents, card }) {
  await sleep(600); // feel of a real round-trip

  if (!method || !['CARD', 'PAYPAL', 'COD'].includes(method)) {
    return { ok: false, reason: 'UNKNOWN_METHOD' };
  }

  // COD always "succeeds" — money changes hands on delivery.
  if (method === 'COD') {
    return { ok: true, txnId: newTxnId('cod'), method, amountCents };
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