/**
 * Transactional email (password reset, order confirmation).
 *
 * Configure with SMTP_URL (e.g. smtps://user:pass@smtp.provider.com:465 —
 * works with Brevo, Mailgun, SendGrid, Gmail app passwords…) and
 * MAIL_FROM ("Yobou <no-reply@yourdomain.com>"). Without SMTP_URL, emails
 * are printed to the server log so development and demos still work.
 * Under NODE_ENV=test they are captured in `outbox` for assertions.
 *
 * sendMail never throws: a mail outage must not fail an order or a reset.
 */
const outbox = [];
let transport = null;

function getTransport() {
  if (transport !== null) return transport;
  if (!process.env.SMTP_URL) {
    transport = false;
    return transport;
  }
  // Lazy require so the dependency is only needed where email is enabled.
  // eslint-disable-next-line global-require
  const nodemailer = require('nodemailer');
  transport = nodemailer.createTransport(process.env.SMTP_URL);
  return transport;
}

const FROM = () => process.env.MAIL_FROM || 'Yobou <no-reply@yobou.app>';

async function sendMail({ to, subject, text, html }) {
  if (!to || /@guest\.local$/i.test(to)) return { skipped: true };
  const mail = { from: FROM(), to, subject, text, html };
  if (process.env.NODE_ENV === 'test') {
    outbox.push(mail);
    return { captured: true };
  }
  const t = getTransport();
  if (!t) {
    console.log(`[mail] (no SMTP_URL — not sent)\n  to: ${to}\n  subject: ${subject}\n  ${text.replace(/\n/g, '\n  ')}`);
    return { logged: true };
  }
  try {
    await t.sendMail(mail);
    return { sent: true };
  } catch (err) {
    console.error('[mail] send failed:', err.message);
    return { error: err.message };
  }
}

// Minimal branded HTML wrapper shared by every template.
function layout(title, bodyHtml) {
  return `<!doctype html><html><body style="margin:0;background:#f4f6fb;font-family:Arial,Helvetica,sans-serif;color:#1b1f2a">
  <table width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px">
  <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:12px;overflow:hidden">
    <tr><td style="background:#1d4ed8;color:#fff;padding:16px 24px;font-size:20px;font-weight:bold">Yobou</td></tr>
    <tr><td style="padding:24px"><h1 style="font-size:20px;margin:0 0 12px">${title}</h1>${bodyHtml}</td></tr>
    <tr><td style="padding:16px 24px;font-size:12px;color:#6b7280;border-top:1px solid #eef0f4">
      You receive this email because you have a Yobou account.</td></tr>
  </table></td></tr></table></body></html>`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const money = (c) => `$${(c / 100).toFixed(2)}`;

function resetPasswordEmail({ name, url, minutes }) {
  return {
    subject: 'Reset your Yobou password',
    text: `Hi ${name},\n\nUse this link to choose a new password (valid ${minutes} minutes):\n${url}\n\nIf you didn't ask for this, ignore this email — your password stays the same.`,
    html: layout('Reset your password', `<p>Hi ${esc(name)},</p>
      <p>Click the button to choose a new password. The link is valid for ${minutes} minutes and works once.</p>
      <p style="margin:24px 0"><a href="${esc(url)}" style="background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Choose a new password</a></p>
      <p style="font-size:13px;color:#6b7280">If you didn't ask for this, ignore this email — your password stays the same.</p>`),
  };
}

function orderConfirmationEmail({ name, order, url }) {
  const short = `#${order.id.slice(-6).toUpperCase()}`;
  const rows = order.items.map((i) => `<tr><td style="padding:6px 0">${esc(i.product?.name || 'Item')} × ${i.quantity}</td>
    <td align="right">${money(i.priceCents * i.quantity)}</td></tr>`).join('');
  const lines = [
    ['Subtotal', money(order.subtotalCents)],
    ...(order.discountCents ? [[`Promo ${order.couponCode}`, `−${money(order.discountCents)}`]] : []),
    ['Delivery', order.shippingCents ? money(order.shippingCents) : 'Free'],
  ];
  return {
    subject: `Order ${short} confirmed`,
    text: `Hi ${name},\n\nThanks for your order ${short} — total ${money(order.totalCents)} (${order.paymentMethod === 'COD' ? 'pay on delivery' : 'paid'}).\nTrack it here: ${url}`,
    html: layout(`Thanks for your order ${short}`, `<p>Hi ${esc(name)}, we've received your order.</p>
      <table width="100%" style="font-size:14px;border-collapse:collapse">${rows}
      ${lines.map(([k, v]) => `<tr><td style="padding:4px 0;color:#6b7280">${esc(k)}</td><td align="right" style="color:#6b7280">${v}</td></tr>`).join('')}
      <tr><td style="padding:8px 0;font-weight:bold;border-top:1px solid #eef0f4">Total</td>
      <td align="right" style="font-weight:bold;border-top:1px solid #eef0f4">${money(order.totalCents)}</td></tr></table>
      <p>${order.paymentMethod === 'COD' ? 'You will pay the courier on delivery.' : 'Payment received.'}</p>
      <p style="margin:24px 0"><a href="${esc(url)}" style="background:#1d4ed8;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:bold">Track your order</a></p>`),
  };
}

module.exports = { sendMail, outbox, resetPasswordEmail, orderConfirmationEmail };
