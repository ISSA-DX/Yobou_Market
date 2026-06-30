/**
 * Tiny in-memory rate limiter.
 *
 * - keyed by IP + route category
 * - sliding window
 * - returns 429 with Retry-After header
 *
 * NOTE: in-memory only. Multi-instance production deployments should swap
 * this for Redis-backed rate limiting so limits are shared across processes.
 */

const windows = new Map();

function key(ip, category) {
  return `${ip}:${category}`;
}

function prune(category, windowMs) {
  const now = Date.now();
  const cutoff = now - windowMs;
  const map = windows.get(category);
  if (!map) return;
  for (const [k, ts] of map) {
    if (ts < cutoff) map.delete(k);
  }
  if (map.size === 0) windows.delete(category);
}

function hit(ip, category, windowMs, maxRequests) {
  if (!windows.has(category)) windows.set(category, new Map());
  const map = windows.get(category);
  const now = Date.now();
  const k = key(ip, category);
  const stamps = map.get(k) || [];
  const cutoff = now - windowMs;
  const recent = stamps.filter((t) => t > cutoff);
  recent.push(now);
  map.set(k, recent);
  return recent.length <= maxRequests;
}

function rateLimit({ category, windowMs = 60_000, maxRequests = 30 } = {}) {
  return (req, res, next) => {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    // Clean up old entries lazily every ~100 requests per category.
    if (Math.random() < 0.01) prune(category, windowMs);

    if (!hit(ip, category, windowMs, maxRequests)) {
      res.setHeader('Retry-After', Math.ceil(windowMs / 1000));
      return res.status(429).json({
        error: 'RATE_LIMITED',
        message: `Too many requests. Please wait ${Math.ceil(windowMs / 1000)} seconds and try again.`,
      });
    }
    next();
  };
}

module.exports = { rateLimit };
