// Single-source helper for the review summary numbers used by both
// the public list endpoint and any future "top rated" sort.
//
// Two queries, one transaction is overkill. The aggregate gives us
// (avg, count); the groupBy gives us the per-bucket counts so the
// histogram on the PDP can render in one round-trip.
const { prisma } = require('../prisma');

async function getReviewSummary(productId) {
  const [agg, groups] = await Promise.all([
    prisma.review.aggregate({
      where: { productId },
      _avg: { rating: true },
      _count: { _all: true },
    }),
    prisma.review.groupBy({
      by: ['rating'],
      where: { productId },
      _count: { _all: true },
    }),
  ]);
  // Always return all 5 buckets so the client can render a stable
  // histogram even when some buckets are empty.
  const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const g of groups) {
    breakdown[g.rating] = g._count._all;
  }
  return {
    averageRating: agg._avg.rating || 0,
    reviewCount: agg._count._all,
    breakdown,
  };
}

module.exports = { getReviewSummary };
