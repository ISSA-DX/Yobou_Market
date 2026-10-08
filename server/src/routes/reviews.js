const express = require('express');
const { z } = require('zod');
const { prisma } = require('../prisma');
const { reviewCreate, reviewListQuery } = require('../lib/validators');
const { requireAuth, requireRole } = require('../auth/middleware');
const { getReviewSummary } = require('../lib/reviewAggregate');
const { notifyReviewChange } = require('../lib/notifications');

const router = express.Router();

// Orders that count toward the "Verified purchase" badge. PAID is the
// floor; anything past it (PROCESSING, SHIPPED, DELIVERED) still counts.
// PLACED doesn't, because the customer might still cancel and the
// order isn't real money yet.
const VERIFIED_STATUSES = ['PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED'];

// Public list of reviews for a product.
//
//   GET /api/products/:id/reviews?limit=20&offset=0&sort=recent|highest|lowest&rating=1..5
//
// Returns { reviews, total, averageRating, breakdown }.
//
//   - `reviews` — paginated rows in the requested order.
//   - `total`   — total count for the product (ignores ?rating=).
//   - `averageRating` — 1-decimal rounded on the client.
//   - `breakdown` — counts per star { 1, 2, 3, 4, 5 } (ignores ?rating=).
//
// `verifiedPurchase` is computed per row by checking the reviewer's
// OrderItem history. ≤50 reviews per page × 1 findFirst = small.
router.get('/products/:id/reviews', async (req, res, next) => {
  try {
    const { id } = req.params;
    const q = reviewListQuery.parse(req.query);

    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });

    const where = { productId: id };
    if (q.rating != null) where.rating = q.rating;

    const orderBy =
      q.sort === 'highest' ? [{ rating: 'desc' }, { createdAt: 'desc' }]
      : q.sort === 'lowest' ? [{ rating: 'asc' }, { createdAt: 'desc' }]
      : [{ createdAt: 'desc' }];

    const [rows, summary] = await Promise.all([
      prisma.review.findMany({
        where,
        orderBy,
        skip: q.offset,
        take: q.limit,
        include: { user: { select: { id: true, name: true } } },
      }),
      getReviewSummary(id),
    ]);

    // Verified-purchase lookup is per-row. OrderItem has no userId —
    // the join goes through order.userId. We over-fetch (one row per
    // OrderItem match, not per user) and dedupe in JS because the
    // SQLite-backed Prisma client doesn't support a distinct combo
    // here. ≤50 reviews × a few order items each = trivial.
    const userIds = [...new Set(rows.map((r) => r.userId))];
    const verifiedSet = new Set();
    if (userIds.length > 0) {
      const hits = await prisma.orderItem.findMany({
        where: {
          productId: id,
          order: { userId: { in: userIds }, status: { in: VERIFIED_STATUSES } },
        },
        select: { order: { select: { userId: true } } },
      });
      for (const h of hits) {
        if (h.order && h.order.userId) verifiedSet.add(h.order.userId);
      }
    }

    const reviews = rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
      user: r.user,
      verifiedPurchase: verifiedSet.has(r.userId),
    }));

    res.json({
      reviews,
      total: summary.reviewCount,
      averageRating: summary.averageRating,
      breakdown: summary.breakdown,
    });
  } catch (err) { next(err); }
});

// Customer writes a review. 1..5 stars, title + body.
//
//   POST /api/products/:id/reviews
//   { rating: 1..5, title: "…", body: "…" }
//
// 401 if not signed in. 403 if not a CUSTOMER. 404 if the product
// doesn't exist. 409 REVIEW_EXISTS if the user already has a review
// for this product (the DB unique index catches the race; we also
// pre-check so the common case returns a clean 409 without a DB
// roundtrip).
router.post('/products/:id/reviews', requireAuth, requireRole('CUSTOMER'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const data = reviewCreate.parse(req.body);

    const product = await prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) return res.status(404).json({ error: 'NOT_FOUND' });

    const existing = await prisma.review.findUnique({
      where: { userId_productId: { userId: req.user.id, productId: id } },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: 'REVIEW_EXISTS' });

    let created;
    try {
      created = await prisma.review.create({
        data: {
          productId: id,
          userId: req.user.id,
          rating: data.rating,
          title: data.title,
          body: data.body,
        },
        include: { user: { select: { id: true, name: true } } },
      });
    } catch (e) {
      // P2002 = unique constraint violation. The pre-check above
      // covers the common case; this is the race-window fallback.
      if (e && e.code === 'P2002') {
        return res.status(409).json({ error: 'REVIEW_EXISTS' });
      }
      throw e;
    }

    notifyReviewChange({ productId: id, action: 'create' });
    res.status(201).json({
      review: {
        id: created.id,
        rating: created.rating,
        title: created.title,
        body: created.body,
        createdAt: created.createdAt,
        user: created.user,
        verifiedPurchase: false,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'INVALID_INPUT', issues: err.issues });
    next(err);
  }
});

// Delete a review. Owner OR admin. 404 / 403 / 200.
router.delete('/reviews/:id', requireAuth, async (req, res, next) => {
  try {
    const review = await prisma.review.findUnique({ where: { id: req.params.id } });
    if (!review) return res.status(404).json({ error: 'NOT_FOUND' });
    if (review.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'FORBIDDEN' });
    }
    await prisma.review.delete({ where: { id: review.id } });
    notifyReviewChange({ productId: review.productId, action: 'delete' });
    res.json({ ok: true });
  } catch (err) { next(err); }
});

module.exports = router;
