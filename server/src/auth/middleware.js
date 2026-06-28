const { verifyAccess } = require('./jwt');
const { prisma } = require('../prisma');

async function loadUser(req) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) return null;
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

function requireApprovedVendor(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'UNAUTHENTICATED' });
  if (req.user.role !== 'VENDOR') return res.status(403).json({ error: 'FORBIDDEN' });
  if (!req.user.vendor || req.user.vendor.status !== 'APPROVED') {
    return res.status(403).json({ error: 'VENDOR_PENDING' });
  }
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

module.exports = { requireAuth, requireRole, requireApprovedVendor, maybeLoadUser, loadUser };
