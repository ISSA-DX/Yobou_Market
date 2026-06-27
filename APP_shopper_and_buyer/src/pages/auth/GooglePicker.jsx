import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import Icon from '../../components/Icon';

const ACCOUNTS = [
  { name: 'Demo Shopper', email: 'shopper@yobou.test', color: 'bg-tertiary' },
  { name: 'Acme Goods', email: 'vendor1@yobou.test', color: 'bg-primary' },
  { name: 'Yobou Admin', email: 'admin@yobou.test', color: 'bg-secondary text-on-secondary' },
];

export default function GooglePicker() {
  const navigate = useNavigate();
  const [picked, setPicked] = useState(null);
  function choose(a) {
    setPicked(a);
    // In a real flow, OAuth handshake. Here we just take them to login.
    setTimeout(() => navigate('/login'), 400);
  }
  return (
    <div className="py-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-9 h-9 rounded-md bg-white shadow-card flex items-center justify-center">
          <span className="font-bold text-primary text-lg">G</span>
        </div>
        <h1 className="text-headline-md font-bold">Sign in with Google</h1>
      </div>
      <p className="text-on-surface-variant text-sm">Choose an account to continue to <strong>Yobou Market</strong>.</p>

      <div className="mt-4 card divide-y divide-outline-variant/20">
        {ACCOUNTS.map((a) => (
          <button
            key={a.email}
            onClick={() => choose(a)}
            className="w-full flex items-center gap-3 p-4 hover:bg-surface-low text-left"
          >
            <div className={`w-10 h-10 rounded-full ${a.color} text-white flex items-center justify-center font-bold`}>
              {a.name[0]}
            </div>
            <div className="flex-1">
              <div className="font-semibold">{a.name}</div>
              <div className="text-label-md text-on-surface-variant">{a.email}</div>
            </div>
            {picked?.email === a.email && <Icon name="check" className="text-tertiary" />}
          </button>
        ))}
        <Link to="/login" className="w-full flex items-center gap-3 p-4 hover:bg-surface-low">
          <div className="w-10 h-10 rounded-full border-2 border-dashed border-outline-variant flex items-center justify-center">
            <Icon name="add" />
          </div>
          <div className="font-semibold">Use another account</div>
        </Link>
      </div>

      <p className="mt-6 text-label-md text-on-surface-variant text-center">
        To continue, Google will share your name, email, and profile picture with Yobou Market.
      </p>

      <div className="mt-8 flex items-center justify-center gap-4 text-label-md text-on-surface-variant">
        <Link to="#">Help</Link>·<Link to="#">Privacy</Link>·<Link to="#">Terms</Link>
      </div>
    </div>
  );
}