/**
 * Lightweight security headers middleware.
 *
 * We deliberately do NOT add the `helmet` dependency because this project
 * avoids new packages. The headers below cover the OWASP basics for a
 * single-page-app API:
 *   - X-Content-Type-Options: nosniff
 *   - X-Frame-Options: DENY
 *   - Referrer-Policy: strict-origin-when-cross-origin
 *   - Content-Security-Policy for API responses (no inline scripts/styles)
 *   - Strict-Transport-Security (when served over HTTPS)
 *
 * The CSP is intentionally permissive for the API itself because the API
 * returns JSON, not HTML. The SPAs are responsible for their own CSP via
 * their build tooling / meta tags.
 */

function securityHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');

  // API responses should never be interpreted as HTML; this is a defence in
  // depth against reflected XSS / content sniffing.
  if (req.path.startsWith('/api/')) {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"
    );
  }

  // HSTS only when the request is HTTPS (or behind a trusted HTTPS proxy).
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  if (isHttps) {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }

  next();
}

module.exports = { securityHeaders };
