// Search by photo — results page (/search/photo).
// The search itself is started by CameraSearchButton / PhotoSearchSheet
// and kept in lib/photoSearch.js, so Back from a product lands here with
// the same results. Server: POST /api/search/image.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import ProductCard, { ProductCardSkeleton } from '../../components/ProductCard';
import PhotoSearchSheet from '../../components/PhotoSearchSheet';
import { startPhotoSearch, usePhotoSession } from '../../lib/photoSearch';
import { useStore } from '../../store';
import { toast } from '../../lib/toast';
import { plural } from '../../lib/categoryFormat';

async function addToCart(p) {
  try {
    await useStore.getState().ensureGuestSession();
    await api('/api/cart', { method: 'POST', body: { productId: p.id, quantity: 1 } });
    await useStore.getState().refreshCartCount();
    toast.addedToCart(p);
  } catch (e) {
    toast.error(e?.data?.error || 'Could not add to cart');
  }
}

export default function PhotoSearch() {
  const navigate = useNavigate();
  const session = usePhotoSession();
  const [sheet, setSheet] = useState(false);
  const [cat, setCat] = useState('');

  const result = session?.status === 'done' ? session.result : null;
  const products = result?.products || [];
  const cats = useMemo(() => {
    const m = new Map();
    products.forEach((p) => m.set(p.category, (m.get(p.category) || 0) + 1));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);
  const shown = cat ? products.filter((p) => p.category === cat) : products;

  function onPick(file) { setCat(''); startPhotoSearch(file); }

  return (
    <div className="px-4 pt-4 pb-8 space-y-4 max-w-5xl mx-auto">
      <header className="flex items-center gap-2">
        <button type="button" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/home'))} className="p-2 -ml-2" aria-label="Back">
          <Icon name="arrow_back" className="text-[24px]" />
        </button>
        <h1 className="text-title-lg font-bold flex-1">Search by photo</h1>
        <Link to="/search" className="p-2 -mr-2 text-on-surface-variant" aria-label="Search by text">
          <Icon name="search" className="text-[24px]" />
        </Link>
      </header>

      {!session ? (
        <Intro onOpen={() => setSheet(true)} />
      ) : (
        <>
          <section className="card overflow-hidden flex items-stretch">
            <div className="relative w-28 sm:w-36 shrink-0 bg-surface-low">
              <img src={session.previewUrl} alt="Your photo" className="absolute inset-0 w-full h-full object-cover" />
              {session.status === 'loading' && <span className="photo-scan absolute inset-0" aria-hidden="true" />}
            </div>
            <div className="flex-1 min-w-0 p-3 flex flex-col justify-center gap-1.5">
              {session.status === 'loading' && (
                <>
                  <p className="font-semibold flex items-center gap-1.5"><Icon name="progress_activity" className="text-[18px] animate-spin text-primary" /> Looking for matches…</p>
                  <p className="text-label-md text-on-surface-variant">Comparing your photo with products on Yobou.</p>
                </>
              )}
              {session.status === 'error' && (
                <>
                  <p className="font-semibold text-error flex items-center gap-1.5"><Icon name="error" className="text-[18px]" /> Search failed</p>
                  <p className="text-label-md text-on-surface-variant">{session.error}</p>
                </>
              )}
              {result && (
                <>
                  {result.detected ? (
                    <p className="text-sm">Looks like <b className="text-on-surface">{result.detected.label}</b></p>
                  ) : (
                    <p className="text-sm font-semibold">{products.length ? 'Visually similar products' : 'No close matches'}</p>
                  )}
                  <p className="text-label-md text-on-surface-variant">{plural(products.length, 'result')}</p>
                  {result.detected && (
                    <Link to={`/search?q=${encodeURIComponent(result.detected.label)}`} className="self-start text-label-md font-semibold text-primary flex items-center gap-0.5">
                      Search “{result.detected.label}” <Icon name="chevron_right" className="text-[16px]" />
                    </Link>
                  )}
                </>
              )}
              <button type="button" onClick={() => setSheet(true)} className="self-start mt-1 h-9 px-3 rounded-full border border-outline/40 text-sm font-semibold flex items-center gap-1.5">
                <Icon name="photo_camera" className="text-[18px]" /> New photo
              </button>
            </div>
          </section>

          {session.status === 'loading' && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {Array.from({ length: 6 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          )}

          {session.status === 'error' && (
            <div className="text-center">
              <button type="button" className="btn-primary px-5 py-2" onClick={() => setSheet(true)}>Try another photo</button>
            </div>
          )}

          {result && products.length > 0 && (
            <>
              {cats.length > 1 && (
                <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
                  {[['', products.length], ...cats].map(([name, n]) => (
                    <button
                      key={name || 'all'}
                      type="button"
                      onClick={() => setCat(name)}
                      className={`shrink-0 h-9 px-3 rounded-full border text-sm font-medium ${cat === name ? 'bg-primary text-white border-primary' : 'bg-surface border-outline-variant/60'}`}
                    >
                      {name || 'All'} <span className={cat === name ? 'text-white/80' : 'text-on-surface-variant'}>{n}</span>
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
                {shown.map((p, i) => (
                  <div key={p.id} className="relative">
                    {i === 0 && !cat && (
                      <span className="absolute z-10 top-2 left-2 rounded-full bg-primary text-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide shadow">Best match</span>
                    )}
                    <ProductCard product={p} onAdd={addToCart} />
                  </div>
                ))}
              </div>
            </>
          )}

          {result && products.length === 0 && (
            <div className="text-center py-8 text-on-surface-variant">
              <div className="w-16 h-16 rounded-full bg-surface-low mx-auto flex items-center justify-center mb-3">
                <Icon name="image_search" className="text-[28px]" />
              </div>
              <p className="text-title-md font-medium text-on-surface">We couldn&apos;t find this item</p>
              <p className="text-sm mt-1 max-w-xs mx-auto">Try a closer photo with the item filling the frame, or search by name.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" className="btn-primary px-5 py-2" onClick={() => setSheet(true)}>Try another photo</button>
                <Link to="/categories" className="btn-secondary px-5 py-2">Browse categories</Link>
              </div>
            </div>
          )}

          {result && products.length > 0 && (
            <p className="text-label-md text-on-surface-variant text-center flex items-center justify-center gap-1">
              <Icon name="tips_and_updates" className="text-[16px]" />
              Not quite it? A close-up on a plain background works best.
            </p>
          )}
        </>
      )}

      <PhotoSearchSheet open={sheet} onClose={() => setSheet(false)} onPick={onPick} />
    </div>
  );
}

function Intro({ onOpen }) {
  return (
    <div className="text-center py-10">
      <div className="w-20 h-20 rounded-3xl bg-primary/10 text-primary mx-auto flex items-center justify-center">
        <Icon name="image_search" className="text-[40px]" />
      </div>
      <h2 className="mt-4 text-title-lg font-bold">Seen something you like?</h2>
      <p className="text-sm text-on-surface-variant mt-1 max-w-xs mx-auto">Take a photo of any product — or use one from your gallery — and we&apos;ll show you matching items on Yobou.</p>
      <button type="button" className="btn-primary mt-5 px-6 py-2.5" onClick={onOpen}>
        <Icon name="photo_camera" /> Search with a photo
      </button>
    </div>
  );
}
