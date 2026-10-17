// ImageField — upload an image (POST /api/products/upload, shared by admin
// and approved partners) or paste a URL. Shows a preview with Remove.
// Used by campaign banners, department hero images and store profiles.
// Kept identical in Internal_Web_Admin and Partner_Web_Vendor by copy.
import { useRef, useState } from 'react';
import { apiForm } from '../api';
import Icon from './Icon';

export default function ImageField({ value, onChange, aspect = 'aspect-[16/7]', hint }) {
  const fileRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  async function upload(file) {
    if (!file) return;
    setBusy(true); setErr('');
    try {
      const fd = new FormData();
      fd.append('image', file);
      const res = await apiForm('/api/products/upload', { body: fd });
      if (res?.url) onChange(res.url);
    } catch (e) {
      setErr(e?.data?.error || e?.message || 'Could not upload the image.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="space-y-2">
      <div className={`relative ${aspect} w-full rounded-xl overflow-hidden border border-dashed border-outline-variant bg-surface-low flex items-center justify-center`}>
        {value ? (
          <img src={assetUrl(value)} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="text-center text-on-surface-variant text-sm px-4">
            <Icon name="image" className="text-[28px]" />
            <div>{busy ? 'Uploading…' : 'No image — the category colours are used'}</div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 items-center">
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => upload(e.target.files?.[0])} />
        <button type="button" className="btn-secondary" onClick={() => fileRef.current?.click()} disabled={busy}>
          <Icon name="upload" /> {busy ? 'Uploading…' : value ? 'Replace' : 'Upload'}
        </button>
        {value && (
          <button type="button" className="btn-secondary text-error" onClick={() => onChange('')} disabled={busy}>
            <Icon name="delete" /> Remove
          </button>
        )}
        <input
          className="input flex-1 min-w-[180px]"
          placeholder="…or paste an image URL"
          value={value || ''}
          onChange={(e) => onChange(e.target.value.trim())}
          aria-label="Image URL"
        />
      </div>
      {hint && <p className="text-label-sm text-on-surface-variant">{hint}</p>}
      {err && <p role="alert" className="text-error text-sm">{err}</p>}
    </div>
  );
}

// Bundled assets (e.g. /seed-images/demo/x.svg) live under this app's own
// base path (/admin/ or /partner/), not the site root.
export function assetUrl(u) {
  if (!u) return u;
  if (/^\/seed-images\//.test(u)) return `${import.meta.env.BASE_URL}${u.slice(1)}`;
  return u;
}
