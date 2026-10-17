// Site footer for laptop/desktop widths (lg and up). Phones navigate with
// the bottom tab bar instead.
import { Link } from 'react-router-dom';
import Icon from './Icon';
import { useApi } from '../useApi.jsx';
import { categoryPath } from '../lib/categoryTheme';
import { termsUrl, privacyUrl } from '../lib/legal';

const PROMISES = [
  ['local_shipping', 'Free delivery', 'On orders over $50'],
  ['payments', 'Pay on delivery', 'Cash or mobile money'],
  ['verified_user', '15-day returns', 'Easy, no-fuss refunds'],
  ['support_agent', 'Real support', 'Help when you need it'],
];

export default function SiteFooter() {
  const cats = useApi('/api/products/categories').data?.categories || [];
  return (
    <footer className="hidden lg:block mt-12 border-t border-outline-variant/40 bg-surface-low">
      <div className="max-w-screen-xl mx-auto px-6 xl:px-8">
        <ul className="grid grid-cols-4 gap-6 py-8 border-b border-outline-variant/40">
          {PROMISES.map(([icon, title, sub]) => (
            <li key={title} className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon name={icon} className="text-[24px]" />
              </span>
              <span>
                <span className="block font-semibold text-on-surface">{title}</span>
                <span className="block text-label-md text-on-surface-variant">{sub}</span>
              </span>
            </li>
          ))}
        </ul>

        <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-8 py-10 text-sm">
          <div>
            <Link to="/home" className="flex items-center gap-2" aria-label="Yobou home">
              <span className="w-9 h-9 rounded-lg bg-gradient-to-br from-primary-container to-primary text-white flex items-center justify-center font-black text-lg">Y</span>
              <span className="font-extrabold text-xl tracking-tight text-on-surface">Yobou</span>
            </Link>
            <p className="mt-3 text-on-surface-variant max-w-xs leading-relaxed">
              Everyday essentials and the latest tech from approved local sellers — delivered to your door.
            </p>
          </div>
          <FooterCol title="Shop">
            {cats.slice(0, 6).map((c) => <FooterLink key={c.name} to={categoryPath(c)}>{c.name}</FooterLink>)}
            <FooterLink to="/categories">All categories</FooterLink>
          </FooterCol>
          <FooterCol title="Your account">
            <FooterLink to="/profile">Profile</FooterLink>
            <FooterLink to="/orders">Orders &amp; tracking</FooterLink>
            <FooterLink to="/wishlist">Wishlist</FooterLink>
            <FooterLink to="/cart">Cart</FooterLink>
          </FooterCol>
          <FooterCol title="Help">
            <FooterLink to="/help">Help centre</FooterLink>
            <FooterLink to="/search/photo">Search by photo</FooterLink>
            <li><a href={termsUrl} target="_blank" rel="noopener noreferrer" className="text-on-surface-variant hover:text-primary">Terms of service</a></li>
            <li><a href={privacyUrl} target="_blank" rel="noopener noreferrer" className="text-on-surface-variant hover:text-primary">Privacy policy</a></li>
          </FooterCol>
        </div>

        <div className="py-5 border-t border-outline-variant/40 flex items-center justify-between text-label-md text-on-surface-variant">
          <span>© {new Date().getFullYear()} Yobou Market. All rights reserved.</span>
          <span className="flex items-center gap-1"><Icon name="lock" className="text-[16px]" /> Secure checkout</span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }) {
  return (
    <div>
      <h2 className="font-bold text-on-surface mb-3">{title}</h2>
      <ul className="space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ to, children }) {
  return <li><Link to={to} className="text-on-surface-variant hover:text-primary">{children}</Link></li>;
}
