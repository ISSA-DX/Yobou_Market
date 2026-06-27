import { useRef, useState } from 'react';
import { getAccessToken } from '../api';
import Icon from './Icon';

const KNOWN_CATEGORIES = [
  'Electronics', 'Phones', 'Computers', 'Fashion', 'Shoes', 'Beauty', 'Home', 'Kitchen',
  'Sports', 'Fitness', 'Toys', 'Gaming', 'TV & Audio', 'Appliances', 'Automotive', 'Books',
  'Grocery', 'Health', 'Pet Supplies', 'Baby', 'Jewelry', 'Watches', 'Bags', 'Office',
  'Garden', 'Tools', 'Arts & Crafts', 'Musical',
];

export default function ProductFormFields({ form, update }) {
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadErr, setUploadErr] = useState('');

  async function uploadFile(file) {
    const token = getAccessToken();
    const body = new FormData();
    body.append('image', file);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch('/api/products/upload', { method: 'POST', headers, body });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Upload failed (${res.status})`);
    }
    const { url } = await res.json();
    return url;
  }

  async function handleFiles(files) {
    const images = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (!images.length) return;
    setUploading(true);
    setUploadErr('');
    try {
      const urls = await Promise.all(images.map(uploadFile));
      update('imageUrls', [...(form.imageUrls || []), ...urls]);
    } catch (e) {
      setUploadErr(e.message || 'Could not upload image(s).');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function removeImage(i) {
    const arr = [...form.imageUrls];
    arr.splice(i, 1);
    update('imageUrls', arr);
  }

  function onDrop(e) {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-label-md text-on-surface-variant">Product name *</label>
        <input
          className="input mt-1"
          value={form.name}
          onChange={(e) => update('name', e.target.value)}
          placeholder="e.g. Wireless Earbuds Pro"
          required
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-label-md text-on-surface-variant">Category *</label>
          <input
            list="category-suggestions"
            className="input mt-1"
            value={form.category}
            onChange={(e) => update('category', e.target.value)}
            placeholder="e.g. Electronics"
            required
          />
          <datalist id="category-suggestions">
            {KNOWN_CATEGORIES.map((c) => <option key={c} value={c} />)}
          </datalist>
        </div>
        <div>
          <label className="text-label-md text-on-surface-variant">Stock *</label>
          <input
            type="number"
            min="0"
            className="input mt-1"
            value={form.stock}
            onChange={(e) => update('stock', Math.max(0, Number(e.target.value) || 0))}
            required
          />
        </div>
      </div>

      <div>
        <label className="text-label-md text-on-surface-variant">Price *</label>
        <div className="mt-1 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">$</span>
          <input
            type="number"
            min="0"
            step="0.01"
            className="input pl-7"
            value={(form.priceCents / 100).toFixed(2)}
            onChange={(e) => update('priceCents', Math.round(Number(e.target.value) * 100))}
            required
          />
        </div>
      </div>

      <div>
        <label className="text-label-md text-on-surface-variant">Description</label>
        <textarea
          className="input mt-1 min-h-32"
          value={form.description}
          onChange={(e) => update('description', e.target.value)}
          placeholder="Describe features, materials, dimensions, warranty…"
        />
      </div>

      <div>
        <label className="text-label-md text-on-surface-variant">Product media</label>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="mt-1 card border-dashed border-2 border-outline/40 p-6 flex flex-col items-center text-on-surface-variant text-center cursor-pointer hover:bg-surface-low transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-surface-low flex items-center justify-center mb-2">
            {uploading ? (
              <Icon name="progress_activity" className="text-[22px] animate-spin text-primary" />
            ) : (
              <Icon name="add_photo_alternate" className="text-[22px]" />
            )}
          </div>
          <div className="text-sm font-medium text-on-surface">{uploading ? 'Uploading…' : 'Drag & drop or click to upload'}</div>
          <div className="text-label-sm mt-1">PNG, JPG, WEBP up to 5 MB each</div>
        </div>

        {uploadErr && (
          <div className="text-error text-sm flex items-center gap-1 mt-2">
            <Icon name="error" className="text-[18px]" /> {uploadErr}
          </div>
        )}

        {form.imageUrls?.length > 0 && (
          <div className="mt-3 grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
            {form.imageUrls.map((url, i) => (
              <div key={`${url}-${i}`} className="relative aspect-square rounded-md overflow-hidden bg-surface-low group">
                <img src={url} alt="" className="w-full h-full object-cover" />
                <button
                  type="button"
                  onClick={() => removeImage(i)}
                  className="absolute top-1 right-1 w-6 h-6 rounded-full bg-white/90 shadow-card text-error opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
                  aria-label="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}