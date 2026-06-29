/**
 * SSE + inbox endpoints.
 *
 * GET  /api/events            — text/event-stream, requireAuth. Pushes a
 *                               notification event for every notify() call
 *                               addressed to this user. Heartbeat every
 *                               25s so intermediaries don't close the
 *                               connection.
 * GET  /api/notifications     — paginated inbox.
 * PATCH /api/notifications/:id/read
 * POST /api/notifications/read-all
 */
const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { requireAuth, requireAuthSse } = require('../auth/middleware');
const {
  registerClient,
  unregisterClient,
  registerAdmin,
  unregisterAdmin,
} = require('../lib/notifications');

const router = express.Router();

// ---------------------------------------------------------------------------
// SSE endpoint
// ---------------------------------------------------------------------------
router.get('/events', requireAuthSse, (req, res) => {
  // Handshake: switch to SSE and flush an immediate `hello` so the client
  // can confirm the connection is live (e.g. before subscribing to UI).
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // disable nginx buffering if proxied
  });
  res.flushHeaders?.();
  res.write(`event: hello\ndata: ${JSON.stringify({ userId: req.user.id, role: req.user.role })}\n\n`);

  // Register for live notifications.
  registerClient(req.user.id, res);
  if (req.user.role === 'ADMIN') registerAdmin(req.user.id, res);

  // Heartbeat. Without this, Render's idle-timeout will close the connection.
  const heartbeat = setInterval(() => {
    try { res.write(`event: ping\ndata: ${Date.now()}\n\n`); } catch { /* dropped */ }
  }, 25_000);

  // Touch lastSeenAt occasionally (best-effort, doesn't block).
  const seenTouch = setInterval(() => {
    prisma.user
      .update({ where: { id: req.user.id }, data: { lastSeenAt: new Date() } })
      .catch(() => {});
  }, 60_000);

  req.on('close', () => {
    clearInterval(heartbeat);
    clearInterval(seenTouch);
    unregisterClient(req.user.id, res);
    if (req.user.role === 'ADMIN') unregisterAdmin(req.user.id, res);
    res.end();
  });
});

// ---------------------------------------------------------------------------
// Inbox endpoints
// ---------------------------------------------------------------------------
router.get('/notifications', requireAuth, async (req, res, next) => {
  try {
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 50));
    const unreadOnly = req.query.unreadOnly === 'true' || req.query.unreadOnly === '1';
    const where = { userId: req.user.id };
    if (unreadOnly) where.readAt = null;
    const [rows, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
      }),
      prisma.notification.count({ where: { userId: req.user.id, readAt: null } }),
    ]);
    res.json({ notifications: rows, unreadCount });
  } catch (err) { next(err); }
});

const idSchema = z.string().min(1).max(64);

router.patch('/notifications/:id/read', requireAuth, async (req, res, next) => {
  try {
    idSchema.parse(req.params.id);
    const row = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { readAt: new Date() },
    });
    if (row.count === 0) return res.status(404).json({ error: 'NOT_FOUND' });
    res.json({ ok: true });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT' });
    next(err);
  }
});

router.post('/notifications/read-all', requireAuth, async (req, res, next) => {
  try {
    const { count } = await prisma.notification.updateMany({
      where: { userId: req.user.id, readAt: null },
      data: { readAt: new Date() },
    });
    res.json({ ok: true, marked: count });
  } catch (err) { next(err); }
});

module.exports = router;