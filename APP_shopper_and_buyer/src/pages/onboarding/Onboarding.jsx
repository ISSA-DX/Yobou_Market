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
  const slide = SLIDES[i];

  useEffect(() => {
    if (user) navigate('/home', { replace: true });
  }, [user, navigate]);

  function next() {
    if (i === SLIDES.length - 1) navigate(user ? '/home' : '/login', { replace: true });
    else setI(i + 1);
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${slide.bg} text-white flex flex-col`}>
      <div className="flex items-center justify-between p-4">
        <div className="w-9 h-9 rounded-md bg-white/20 backdrop-blur flex items-center justify-center font-black">Y</div>
        <button type="button" onClick={() => navigate(user ? '/home' : '/login', { replace: true })} className="text-sm font-semibold">Skip</button>
      </div>

      {/* Keyed by slide so each slide replays its entrance animations. */}
      <div key={i} className="flex-1 flex flex-col items-center justify-center text-center px-8">
        <div className="reveal reveal-pop mb-10">
          <div className="anim-float w-44 h-44 rounded-full bg-white/15 backdrop-blur flex items-center justify-center">
            <Icon name={slide.icon} className="text-[88px]" fill />
          </div>
        </div>
        {/* text-white: the global h1 brand-blue would vanish on the gradient. */}
        <h1 className="reveal reveal-blur text-headline-lg font-bold text-white" style={{ '--reveal-delay': '120ms' }}>{slide.title}</h1>
        <p className="reveal reveal-fade-up mt-3 max-w-xs text-white/90" style={{ '--reveal-delay': '220ms' }}>{slide.body}</p>

        {/* Floating trust badges */}
        <div className="reveal-stagger stagger-pop mt-10 flex gap-2" style={{ '--stagger-step': '120ms' }}>
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
        <button type="button" onClick={next} className="w-full bg-white text-primary font-bold py-3 rounded-full hover:bg-white/90 transition">
          {i === SLIDES.length - 1 ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  );
}