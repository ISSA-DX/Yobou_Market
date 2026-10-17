// "Find by photo" for product lists: take or upload a photo, the server
// ranks this account's products against it (routes/visualSearch.js) and
// onResult({ previewUrl, matches, detected }) hands back the ranked ids.
// Kept identical in Internal_Web_Admin and Partner_Web_Vendor by copy;
// only `endpoint` differs.
import { useEffect, useRef, useState } from 'react';
import { apiForm } from '../api';
import Icon from './Icon';
import { shrinkPhoto } from '../lib/photo';

function message(e) {
  if (e?.code === 'NETWORK_ERROR') return 'No connection — try again.';
  if (e?.status === 429) return 'Too many photo searches. Wait a minute.';
  if (e?.status === 413) return 'That photo is too large.';
  return e?.data?.message || 'Photo search failed.';
}

export default function PhotoSearchButton({ endpoint, onResult }) {
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const cameraRef = useRef(null);
  const fileRef = useRef(null);
  const boxRef = useRef(null);

  useEffect(() => {
    if (!menu) return undefined;
    const close = (e) => { if (!boxRef.current?.contains(e.target)) setMenu(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [menu]);

  async function run(e) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMenu(false); setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('image', await shrinkPhoto(file), 'photo.jpg');
      const r = await apiForm(endpoint, { body: fd });
      onResult({ previewUrl: URL.createObjectURL(file), matches: r.matches || [], detected: r.detected || null });
    } catch (ex) {
      setErr(message(ex));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={boxRef} className="relative">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={run} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={run} />
      <button type="button" onClick={() => setMenu((m) => !m)} disabled={busy} className="btn-secondary py-2 px-3" aria-haspopup="menu" aria-expanded={menu} title="Find products by photo">
        <Icon name={busy ? 'progress_activity' : 'photo_camera'} className={busy ? 'animate-spin' : ''} />
        <span className="hidden sm:inline">{busy ? 'Matching…' : 'Photo'}</span>
      </button>
      {menu && (
        <div role="menu" className="absolute right-0 top-full mt-1 z-30 w-52 card p-1 shadow-lg">
          <button role="menuitem" type="button" onClick={() => cameraRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-surface-low">
            <Icon name="photo_camera" className="text-[20px]" /> Take a photo
          </button>
          <button role="menuitem" type="button" onClick={() => fileRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-surface-low">
            <Icon name="image" className="text-[20px]" /> Upload a photo
          </button>
        </div>
      )}
      {err && <div role="alert" className="absolute right-0 top-full mt-1 z-20 w-56 text-label-sm text-error bg-surface card p-2">{err}</div>}
    </div>
  );
}

// Banner shown above the list while a photo filter is on.
export function PhotoFilterBanner({ photo, count, onClear }) {
  return (
    <div className="card p-2 pr-3 flex items-center gap-3 border border-primary/30">
      <img src={photo.previewUrl} alt="Your photo" className="w-12 h-12 rounded-md object-cover bg-surface-low" />
      <div className="flex-1 min-w-0 text-sm">
        <div className="font-semibold">
          {count ? `${count} product${count === 1 ? '' : 's'} match your photo` : 'No products match your photo'}
        </div>
        <div className="text-label-md text-on-surface-variant truncate">
          {photo.detected ? `Looks like: ${photo.detected.label}` : 'Closest matches first'}
        </div>
      </div>
      <button type="button" onClick={onClear} className="btn-secondary py-1.5 px-3 text-sm">
        <Icon name="close" className="text-[18px]" /> Clear
      </button>
    </div>
  );
}
