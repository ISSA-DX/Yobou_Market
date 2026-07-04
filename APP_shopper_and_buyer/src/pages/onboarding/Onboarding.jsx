import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../../store';
import Icon from '../../components/Icon';

const SLIDES = [
  {
    title: 'Shop everything',
    body: 'From electronics to fashion — discover thousands of sellers in one place.',
    bg: 'from-primary to-primary-container',
    icon: 'shopping_bag',
  },
  {
    title: 'Trusted sellers',
    body: 'Every vendor is verified. Pay safely with cards, PayPal, or cash on delivery.',
    bg: 'from-tertiary to-tertiary-container',
    icon: 'verified_user',
  },
  {
    title: 'Fast delivery',
    body: 'Track every order in real time, from the warehouse to your doorstep.',
    bg: 'from-secondary to-yellow-400',
    icon: 'local_shipping',
  },
];

export default function Onboarding() {
  const [i, setI] = useState(0);
  const navigate = useNavigate();
  const user = useStore((s) => s.user);
  const bootDone = useStore((s) => s.bootDone);

  // Cold-start returning users skip the splash carousel entirely.
  // boot() (in store.js) restores user from the refresh cookie via
  // /api/auth/refresh on first App mount; once bootDone flips true we
  // know the auth-restoration has had its chance and can short-circuit.
  // Without this, a signed-in customer re-installing or re-launching
  // sees the three marketing slides on every cold start and is forced
  // back to /login despite holding a valid session.
  useEffect(() => {
    if (!bootDone) return;
    if (user) navigate('/home', { replace: true });
  }, [user, bootDone, navigate]);

  const slide = SLIDES[i];

  function next() {
    // Last slide's CTA must ALWAYS land on the sign-in screen. The
    // product expectation in 2026 is that a Yobou account is required
    // to browse (so orders, addresses, and cart selection persist to
    // a real identity, not just an anonymous query string). Previous
    // versions routed straight to /home and dipped the user into a
    // guest session — that path was a regression on day one of the
    // Phase-2 APK pilot ("The signing page should enabled").
    // `replace: true` so the back button doesn't bounce the user out
    // of the sign-in screen back into the splash carousel.
    if (i === SLIDES.length - 1) navigate('/login', { replace: true });
    else setI(i + 1);
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${slide.bg} text-white flex flex-col`}>
      <div className="flex items-center justify-between p-4">
        <div className="w-9 h-9 rounded-md bg-white/20 backdrop-blur flex items-center justify-center font-black">Y</div>
        {/* Top-right pill originally read "Sign in" — renamed to
            "Skip" because once the marketing carousel finishes, the
            final slide presents BOTH "Sign in" AND "Create account"
            as filled CTAs at the bottom; duplicating "Sign in" up
            here read like two different actions. "Skip" matches the
            actual behaviour (skip the remaining slides) and removes
            the label dup on slide 3. */}
        <button type="button" onClick={() => navigate('/login', { replace: true })} className="text-sm font-semibold">Skip intro</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="w-44 h-44 rounded-full bg-white/15 backdrop-blur flex items-center justify-center mb-10">
          <Icon name={slide.icon} className="text-[88px]" fill />
        </div>
        <h1 className="text-headline-lg font-bold">{slide.title}</h1>
        <p className="mt-3 max-w-xs text-white/90">{slide.body}</p>

        {/* Floating trust badges */}
        <div className="mt-10 flex gap-2">
          {['Trusted Sellers', 'Fast Delivery'].map((label, idx) => (
            <div key={label} className="px-3 py-1.5 rounded-full bg-white/15 backdrop-blur text-label-md font-medium flex items-center gap-1">
              <Icon name={idx === 0 ? 'verified' : 'bolt'} className="text-[14px]" />
              {label}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6">
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {SLIDES.map((_, idx) => (
            <div
              key={idx}
              className={`h-1.5 rounded-full transition-all ${idx === i ? 'w-6 bg-white' : 'w-1.5 bg-white/40'}`}
            />
          ))}
        </div>
        {i === SLIDES.length - 1 ? (
          <>
            {/* Final slide: separate the two paths visually so a
                new visitor doesn't end up on the sign-in screen and
                have to hunt for a "Sign up" link buried inside
                Login.jsx. The white pill = primary path (returning
                users have credentials to enter); the outlined pill
                = clearly labelled "Create account". Both use
                replace:true so the back button doesn't bounce the
                user back into the splash carousel. */}
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="w-full bg-white text-primary font-bold py-3 rounded-full hover:bg-white/90 transition"
            >
              Sign in
            </button>
            <button
              onClick={() => navigate('/register', { replace: true })}
              className="mt-3 w-full bg-white/10 backdrop-blur border border-white/50 text-white font-bold py-3 rounded-full hover:bg-white/20 transition"
            >
              Create account
            </button>
          </>
        ) : (
          <button type="button" onClick={next} className="w-full bg-white text-primary font-bold py-3 rounded-full hover:bg-white/90 transition">
            Next
          </button>
        )}
      </div>
    </div>
  );
}