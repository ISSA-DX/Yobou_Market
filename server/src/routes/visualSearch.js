// Search by photo — see lib/visualSearch.js for how matching works.
//
//   POST /api/search/image                 shoppers (LIVE products, full cards)
//   POST /api/admin/products/search-image  admins  (every product, ids + scores)
//   POST /api/vendor/products/search-image partners (own products, ids + scores)
//
// Body: multipart/form-data with one `image` file. The photo is processed
// in memory and never stored.
const express = require('express');
const multer = require('multer');
const { prisma } = require('../prisma');
const { requireAuth, requireRole, requireApprovedVendor } = require('../auth/middleware');
const { rateLimit } = require('../lib/rateLimit');
const { searchByImage } = require('../lib/visualSearch');
const { formatProduct } = require('../lib/merch');

const MAX_PHOTO_MB = 10;

const photo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PHOTO_MB * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
}).single('image');

// Wrap multer so an oversized file is a clean 413, not a 500.
function receivePhoto(req, res, next) {
  photo(req, res, (err) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'PHOTO_TOO_LARGE', message: `Photos up to ${MAX_PHOTO_MB} MB.` });
    if (err) return next(err);
    if (!req.file) return res.status(400).json({ error: 'NO_PHOTO', message: 'Attach a photo as "image".' });
    next();
  });
}

// Each search decodes every uncached product image, and may call the AI
// service, so keep it well below the browse-rate.
const photoRateLimit = rateLimit({ category: 'photo-search', windowMs: 60_000, maxRequests: 12 });

async function run(req, res, next, where) {
  try {
    return await searchByImage(req.file.buffer, { where, limit: Number(req.query.limit) > 0 ? Math.min(48, Number(req.query.limit)) : 24 });
  } catch (err) {
    if (err.message === 'UNREADABLE_IMAGE') {
      res.status(400).json({ error: 'UNREADABLE_IMAGE', message: 'That file could not be read as a photo. Try a JPEG or PNG.' });
      return null;
    }
    next(err);
    return null;
  }
}

function summary(r) {
  return { mode: r.mode, detected: r.ai, words: r.words, pending: r.pending };
}

const publicRouter = express.Router();
publicRouter.post('/search/image', photoRateLimit, receivePhoto, async (req, res, next) => {
  const r = await run(req, res, next, { status: 'LIVE' });
  if (!r) return;
  try {
    const rows = r.ranked.length
      ? await prisma.product.findMany({
        where: { id: { in: r.ranked.map((x) => x.id) }, status: 'LIVE' },
        include: {
          vendor: { select: { id: true, businessName: true } },
          variants: { select: { id: true, color: true, size: true, stock: true, imageUrls: true } },
          extraCategories: { select: { id: true, name: true, subcategory: true } },
        },
      })
      : [];
    const byId = new Map(rows.map((p) => [p.id, p]));
    const products = r.ranked.filter((x) => byId.has(x.id)).map((x) => ({ ...formatProduct(byId.get(x.id)), matchScore: x.score }));
    res.json({ products, ...summary(r) });
  } catch (err) { next(err); }
});

const adminRouter = express.Router();
adminRouter.post('/products/search-image', requireAuth, requireRole('ADMIN'), photoRateLimit, receivePhoto, async (req, res, next) => {
  const r = await run(req, res, next, {});
  if (r) res.json({ matches: r.ranked, ...summary(r) });
});

const vendorRouter = express.Router();
vendorRouter.post('/products/search-image', requireAuth, requireApprovedVendor, photoRateLimit, receivePhoto, async (req, res, next) => {
  const r = await run(req, res, next, { vendorId: req.user.vendor.id });
  if (r) res.json({ matches: r.ranked, ...summary(r) });
});

module.exports = { publicRouter, adminRouter, vendorRouter };
