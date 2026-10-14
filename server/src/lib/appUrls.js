// Public URLs of the three web apps, used to build links in emails
// (password reset, order tracking). Never taken from the request, so an
// attacker can't make Yobou email a reset link pointing at their site.
// Override per environment with SHOPPER_URL / PARTNER_URL / ADMIN_URL.
const isProd = process.env.NODE_ENV === 'production';

const DEFAULTS = isProd
  ? {
    shopper: 'https://issa-dx.github.io/Yobou_Market/',
    partner: 'https://issa-dx.github.io/Yobou_Market/partner/',
    admin: 'https://issa-dx.github.io/Yobou_Market/admin/',
  }
  : {
    shopper: 'http://localhost:5173/',
    partner: 'http://localhost:5176/partner/',
    admin: 'http://localhost:5174/admin/',
  };

function base(app) {
  const env = { shopper: process.env.SHOPPER_URL, partner: process.env.PARTNER_URL, admin: process.env.ADMIN_URL }[app];
  const url = env || DEFAULTS[app];
  return url.endsWith('/') ? url : `${url}/`;
}

// Which app a user signs in to.
function appForRole(role) {
  if (role === 'ADMIN') return 'admin';
  if (role === 'VENDOR' || role === 'DRIVER') return 'partner';
  return 'shopper';
}

function appUrl(app, path) {
  return `${base(app)}${path.replace(/^\//, '')}`;
}

module.exports = { appUrl, appForRole };
