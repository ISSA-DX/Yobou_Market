// Password reset links. The raw token only ever exists in the emailed URL;
// the database keeps its SHA-256, a 30-minute expiry, and a used flag.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const { prisma } = require('../prisma');
const { appUrl, appForRole } = require('./appUrls');
const { sendMail, resetPasswordEmail } = require('./mailer');

const TTL_MINUTES = 30;
const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

async function issueResetLink(user) {
  const token = crypto.randomBytes(32).toString('base64url');
  // Only the newest link works.
  await prisma.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.passwordResetToken.create({
    data: { userId: user.id, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL_MINUTES * 60 * 1000) },
  });
  const url = appUrl(appForRole(user.role), `reset-password?token=${token}`);
  await sendMail({ to: user.email, ...resetPasswordEmail({ name: user.name, url, minutes: TTL_MINUTES }) });
  return { url, expiresInMinutes: TTL_MINUTES };
}

// Returns the user on success; throws Error('RESET_TOKEN_INVALID') otherwise.
async function consumeResetToken(token, newPassword) {
  const row = await prisma.passwordResetToken.findUnique({ where: { tokenHash: hash(String(token || '')) }, include: { user: true } });
  if (!row || row.usedAt || row.expiresAt < new Date() || row.user.disabledAt) {
    throw new Error('RESET_TOKEN_INVALID');
  }
  const passwordHash = await bcrypt.hash(newPassword, 12);
  // passwordChangedAt revokes every session issued with the old password.
  const [, user] = await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: row.userId }, data: { passwordHash, passwordChangedAt: new Date() } }),
  ]);
  return user;
}

// True when a JWT was issued before the user's last password change.
function issuedBeforePasswordChange(user, iatSeconds) {
  if (!user?.passwordChangedAt || !iatSeconds) return false;
  return iatSeconds < Math.floor(user.passwordChangedAt.getTime() / 1000);
}

module.exports = { issueResetLink, consumeResetToken, issuedBeforePasswordChange, TTL_MINUTES };
