const jwt = require('jsonwebtoken');

const isProd = process.env.NODE_ENV === 'production';
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || (isProd ? null : 'dev-access-secret-change-me');
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || (isProd ? null : 'dev-refresh-secret-change-me');

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in production');
}

function signAccess(user) {
  return jwt.sign(
    { sub: user.id, email: user.email, role: user.role },
    ACCESS_SECRET,
    { expiresIn: process.env.JWT_ACCESS_TTL || '15m' }
  );
}

function signRefresh(user) {
  return jwt.sign(
    { sub: user.id, type: 'refresh' },
    REFRESH_SECRET,
    { expiresIn: process.env.JWT_REFRESH_TTL || '7d' }
  );
}

function verifyAccess(token) {
  return jwt.verify(token, ACCESS_SECRET);
}

function verifyRefresh(token) {
  return jwt.verify(token, REFRESH_SECRET);
}

module.exports = { signAccess, signRefresh, verifyAccess, verifyRefresh };
