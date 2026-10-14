// Restrict an order to the line items a vendor actually sells.
//
// A shopper's order can mix products from several stores (and Yobou
// Direct). A vendor must only see their own items and their own share
// of the money — never a competitor's products or prices — so every
// vendor-facing order response goes through this helper.
function scopeOrderToVendor(order, vendorId) {
  if (!order) return order;
  const items = (order.items || []).filter((i) => i.product && i.product.vendorId === vendorId);
  const vendorSubtotalCents = items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
  const { refunds, delivery, ...rest } = order;
  return {
    ...rest,
    items,
    vendorView: true,
    // Totals become the vendor's share; shipping is billed by Yobou.
    subtotalCents: vendorSubtotalCents,
    shippingCents: 0,
    totalCents: vendorSubtotalCents,
    ...(refunds !== undefined ? { refunds } : {}),
    ...(delivery ? { delivery: { status: delivery.status, pickedUpAt: delivery.pickedUpAt, deliveredAt: delivery.deliveredAt } } : {}),
  };
}

module.exports = { scopeOrderToVendor };
