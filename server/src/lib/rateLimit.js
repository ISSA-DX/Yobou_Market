/**
 * Abuse protection for the public auth endpoints.
 *
 *   rateLimit({ windowMs, max })  — per-IP fixed window → 429 RATE_LIMITED
 *   loginGuard                    — per-email lockout after repeated wrong
 *                                    passwords → 429 TOO_MANY_ATTEMPTS
 *
 * State is in memory, which is right for the single Render instance this
 * app runs on. If you scale to several instances, move these counters to
 * Redis (same interface). The per-IP limiter is off under NODE_ENV=test
 * and development (local testing logs in constantly from one IP) unless a
 * caller passes { force: true } or RATE_LIMIT_IN_DEV=1 is set. The
 * per-account loginGuard is always on.
 */
function rateLimit({ windowMs, max, name = 'default', force = false }) {
  const hits = new Map(); // key → { count, resetAt }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
  }, windowMs);
  sweep.unref?.();

  return function limiter(req, res, next) {
    const env = process.env.NODE_ENV;
    const relaxed = env === 'test' || (env === 'development' && process.env.RATE_LIMIT_IN_DEV !== '1');
    if (relaxed && !force) return next();
    const key = `${name}:${req.ip}`;
    const now = Date.now();
    let entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      const retryAfterSec = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfterSec));
      return res.status(429).json({ error: 'RATE_LIMITED', retryAfterSec });
    }
    next();
  };
}

// Per-account lockout: 5 wrong passwords within 15 minutes locks that
// email for the rest of the window, whatever IP the attempts come from.
const LOCK_MAX = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const failures = new Map(); // email → { count, resetAt }

const loginGuard = {
  isLocked(email) {
    const f = failures.get(email);
    if (!f) return 0;
    if (f.resetAt <= Date.now()) { failures.delete(email); return 0; }
    return f.count >= LOCK_MAX ? Math.ceil((f.resetAt - Date.now()) / 1000) : 0;
  },
  fail(email) {
    const now = Date.now();
    const f = failures.get(email);
    if (!f || f.resetAt <= now) failures.set(email, { count: 1, resetAt: now + LOCK_WINDOW_MS });
    else f.count += 1;
  },
  succeed(email) {
    failures.delete(email);
  },
  reset() {
    failures.clear();
  },
};

module.exports = { rateLimit, loginGuard, LOCK_MAX };
