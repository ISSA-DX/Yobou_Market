import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  const slide = SLIDES[i];

  function next() {
    if (i === SLIDES.length - 1) navigate('/home');
    else setI(i + 1);
  }

  return (
    <div className={`min-h-screen bg-gradient-to-br ${slide.bg} text-white flex flex-col`}>
      <div className="flex items-center justify-between p-4">
        <div className="w-9 h-9 rounded-md bg-white/20 backdrop-blur flex items-center justify-center font-black">Y</div>
        <button onClick={() => navigate('/home')} className="text-sm font-semibold">Skip</button>
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
        <button onClick={next} className="w-full bg-white text-primary font-bold py-3 rounded-full hover:bg-white/90 transition">
          {i === SLIDES.length - 1 ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  );
}