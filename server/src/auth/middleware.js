const { verifyAccess } = require('./jwt');
const { prisma } = require('../prisma');

async function loadUser(req) {
  let token = null;
  const header = req.headers.authorization || '';
  const [scheme, hdrToken] = header.split(' ');
  if (scheme === 'Bearer' && hdrToken) token = hdrToken;
  try {
    const payload = verifyAccess(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { vendor: true },
    });
    // Reject disabled users at the load step so every subsequent route
    // is automatically protected. The disabledAt flag is set by admin
    // via /api/admin/users/:id and unset via the same endpoint to
    // re-enable. The check is also re-applied in auth/routes.js for
    // login + refresh so disabled users cannot mint new sessions.
    if (user && user.disabledAt) return null;
    return user;
  } catch (err) {
    // Treat JWT verification failures as unauthenticated; propagate everything else.
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') return null;
    throw err;
  }
}

function requireAuth(req, res, next) {
  loadUser(req)
    .then((user) => {
      if (!user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
      req.user = user;
      next();
    })
    .catch(next);
}

function requireRole(...allowed) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    if (!allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    next();
  };
}

// requireApprovedVendor — gates routes that only an APPROVED vendor may
// call. PENDING vendors get a distinct error code so the partner SPA can
// render the "Awaiting approval" status page instead of treating this
// as a generic 403.
function requireApprovedVendor(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  if (req.user.role !== 'VENDOR') return res.status(403).json({ error: 'FORBIDDEN' });
  if (!req.user.vendor) return res.status(403).json({ error: 'VENDOR_RECORD_MISSING' });
  if (req.user.vendor.status === 'PENDING') return res.status(403).json({ error: 'VENDOR_PENDING' });
  if (req.user.vendor.status === 'REJECTED') return res.status(403).json({ error: 'VENDOR_REJECTED' });
  if (req.user.vendor.status === 'SUSPENDED') return res.status(403).json({ error: 'VENDOR_SUSPENDED' });
  if (req.user.vendor.status !== 'APPROVED') return res.status(403).json({ error: 'VENDOR_PENDING' });
  next();
}

// Optional — populates req.user if a token is present, but never blocks.
async function maybeLoadUser(req, _res, next) {
  try {
    req.user = await loadUser(req);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * SSE-aware requireAuth. EventSource cannot set custom headers, so the
 * client passes the access token via ?t=... on the SSE endpoint only.
 * Prefer the Authorization header when present (which is the default for
 * every other route). This middleware must only be mounted on the SSE
 * route — do not wire it onto API endpoints, since query-string tokens
 * leak into logs.
 */
async function requireAuthSse(req, res, next) {
  let token = null;
  const header = req.headers.authorization || '';
  const [scheme, hdrToken] = header.split(' ');
  if (scheme === 'Bearer' && hdrToken) token = hdrToken;
  if (!token && typeof req.query?.t === 'string') token = req.query.t;
  if (!token) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  try {
    const { verifyAccess } = require('./jwt');
    const { prisma } = require('../prisma');
    const payload = verifyAccess(token);
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      include: { vendor: true },
    });
    if (!user || user.disabledAt) return res.status(401).json({ error: 'UNAUTHENTICATED' });
    req.user = user;
    next();
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'UNAUTHENTICATED' });
    }
    next(err);
  }
}

module.exports = { requireAuth, requireRole, requireApprovedVendor, maybeLoadUser, loadUser, requireAuthSse };
