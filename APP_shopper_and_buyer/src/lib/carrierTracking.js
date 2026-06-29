// Carrier → outbound tracking URL. Returns null if unknown / no number.
export function trackingUrl(carrier, num) {
  if (!carrier || !num) return null;
  const n = encodeURIComponent(num);
  switch (carrier) {
    case 'DHL': return `https://www.dhl.com/en/express/tracking.html?AWB=${n}`;
    case 'FedEx': return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
    case 'UPS': return `https://www.ups.com/track?tracknum=${n}`;
    case 'USPS': return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${n}`;
    default: return null;
  }
}