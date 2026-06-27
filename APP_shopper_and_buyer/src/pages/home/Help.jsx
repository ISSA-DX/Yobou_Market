import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';

const FAQS = [
  { q: 'How do I track my order?', a: 'Go to Orders and tap any order to see live tracking and status updates.' },
  { q: 'What payment methods are accepted?', a: 'We accept card, PayPal, and cash on delivery (COD) in supported regions.' },
  { q: 'How do I become a seller?', a: 'Tap “Become a Partner” on the login screen and submit your business details for approval.' },
  { q: 'How can I contact support?', a: 'Email support@yobou.market or call +1 (800) 555-1234.' },
];

export default function Help() {
  return (
    <div className="px-4 pt-4 pb-6 space-y-5">
      <header className="flex items-center gap-2">
        <Link to="/home" className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></Link>
        <h1 className="text-headline-md font-bold flex-1">Help &amp; Support</h1>
      </header>

      <div className="card p-5 bg-gradient-to-br from-primary to-primary-container text-white">
        <h2 className="font-bold text-headline-md">Need help?</h2>
        <p className="mt-1 opacity-90">Our support team is available 24/7 to assist you.</p>
        <div className="mt-4 flex gap-3">
          <a href="mailto:support@yobou.market" className="btn-secondary flex-1 py-2">Email support</a>
          <a href="tel:+18005551234" className="btn-primary flex-1 py-2">Call us</a>
        </div>
      </div>

      <div className="space-y-3">
        {FAQS.map((f, i) => (
          <div key={i} className="card p-4">
            <div className="font-semibold">{f.q}</div>
            <div className="mt-1 text-sm text-on-surface-variant">{f.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
