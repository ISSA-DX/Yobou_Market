import { Link, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import Icon from '../../components/Icon';

export default function AppleConfirm() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('share'); // 'share' | 'hide'

  function confirm() {
    setTimeout(() => navigate('/login'), 300);
  }

  return (
    <div className="py-6">
      <div className="flex items-center gap-3 mb-4">
        <Icon name="phone_iphone" className="text-[28px]" fill />
        <h1 className="text-headline-md font-bold">Sign in with Apple</h1>
      </div>

      <div className="card p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-primary text-white flex items-center justify-center font-bold">D</div>
        <div>
          <div className="font-semibold">Demo Shopper</div>
          <div className="text-label-md text-on-surface-variant">shopper@yobou.test</div>
        </div>
      </div>

      <div className="mt-4 card divide-y divide-outline-variant/20">
        <label className="flex items-start gap-3 p-4 cursor-pointer">
          <input type="radio" checked={mode === 'share'} onChange={() => setMode('share')} className="mt-1" />
          <div>
            <div className="font-semibold">Share my email</div>
            <div className="text-label-md text-on-surface-variant">Yobou Market will receive shopper@yobou.test.</div>
          </div>
        </label>
        <label className="flex items-start gap-3 p-4 cursor-pointer">
          <input type="radio" checked={mode === 'hide'} onChange={() => setMode('hide')} className="mt-1" />
          <div>
            <div className="font-semibold">Hide my email</div>
            <div className="text-label-md text-on-surface-variant">Apple will create a unique forwarding address.</div>
          </div>
        </label>
      </div>

      <div className="mt-8 flex flex-col items-center text-on-surface-variant">
        <div className="relative w-24 h-24 rounded-full border-4 border-outline-variant/40 flex items-center justify-center">
          <Icon name="face" className="text-[48px]" />
          <div className="absolute inset-0 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        </div>
        <p className="mt-4 text-sm">Confirm with Face ID</p>
      </div>

      <div className="mt-8 space-y-3">
        <button onClick={confirm} className="btn-primary w-full py-3 bg-black hover:bg-gray-900">Continue with Apple</button>
        <Link to="/login" className="btn-secondary w-full py-3">Cancel</Link>
      </div>
    </div>
  );
}