import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { useProductLiveSync } from '../../lib/useProductLiveSync';

const STATUS_STYLES = {
  LIVE: 'bg-tertiary-container/20 text-tertiary border-0',
  DRAFT: 'bg-secondary/20 text-secondary border-0',
  HIDDEN: 'bg-error/10 text-error border-0',
};

export default function Products() {
  const [q, setQ] = useState('');
  const { data, error, loading, refetch } = useApi(`/api/admin/products${q ? `?q=${encodeURIComponent(q)}` : ''}`);
  const [actionErr, setActionErr] = useState('');
  const [actionOk, setActionOk] = useState('');
  // Live sync — refetch when anyone (this admin tab included, or a vendor's
  // approval) creates/updates/deletes any product. The setSearch below
  // already updates the URL after a local edit; this catches incoming
  // events so other admin tabs and partner approvals propagate here.
  useProductLiveSync(refetch);

  const products = data?.products || [];

  async function remove(p) {
    const ok = window.confirm(`Delete “${p.name}”? This cannot be undone.`);
    if (!ok) return;
    setActionErr('');
    setActionOk('');
    try {
      await api(`/api/products/${p.id}`, { method: 'DELETE' });
      setActionOk(`“${p.name}” deleted.`);
      refetch();
    } catch (e) {
      const msg = e.data?.error;
      if (msg === 'PRODUCT_HAS_ORDERS') {
        setActionErr(`“${p.name}” has existing orders and cannot be deleted. Set status to HIDDEN instead.`);
      } else {
        setActionErr(e.data?.error || e.message || 'Could not delete product.');
      }
    }
  }

  if (error && !data) {
    return <RetryError message="Couldn't load products." onRetry={refetch} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-col sm:flex-row">
        <h1 className="text-headline-lg font-bold">All products</h1>
        <Link to="/products/new" className="btn-primary">
          <Icon name="add" /> Add product
        </Link>
      </div>

      {actionErr && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[20px] shrink-0" />
          <span>{actionErr}</span>
        </div>
      )}

      {actionOk && (
        <div className="card p-4 bg-tertiary-container/20 text-tertiary text-sm flex items-center gap-2">
          <Icon name="check_circle" className="text-[20px]" />
          <span>{actionOk}</span>
        </div>
      )}

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
          <input
            className="input pl-10"
            placeholder="Search by name, category, or description"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {q && (
          <button onClick={() => setQ('')} className="btn-secondary py-2 px-3">Clear</button>
        )}
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                  <Icon name="progress_activity" className="text-[24px] animate-spin inline-block" />
                  <span className="ml-2">Loading products…</span>
                </td>
              </tr>
            )}

            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-on-surface-variant">
                  {q ? `No products match “${q}”.` : 'No products yet.'}
                </td>
              </tr>
            )}

            {products.map((p) => (
              <tr key={p.id} className="border-t border-outline-variant/20">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={productImage(p)}
                      alt=""
                      className="w-12 h-12 rounded-md object-cover bg-surface-low"
                      onError={(e) => { e.currentTarget.src = `${import.meta.env.BASE_URL}seed-images/placeholder.svg`; }}
                    />
                    <div className="min-w-0">
                      <div className="font-semibold line-clamp-1">{p.name}</div>
                      <div className="text-label-md text-on-surface-variant line-clamp-1">{p.id.slice(-8).toUpperCase()}</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{p.category}</td>
                <td className="px-4 py-3 font-semibold">${(p.priceCents / 100).toFixed(2)}</td>
                <td className="px-4 py-3">{p.stock}</td>
                <td className="px-4 py-3 text-on-surface-variant">{p.vendor?.businessName || 'Yobou Direct'}</td>
                <td className="px-4 py-3">
                  <div className="flex flex-col gap-1 items-start">
                    <span className={`chip ${STATUS_STYLES[p.status] || STATUS_STYLES.HIDDEN}`}>{p.status}</span>
                    {p.pendingChanges?.length > 0 && (
                      <Link
                        to="/changes"
                        className="chip bg-secondary/20 text-secondary flex items-center gap-1"
                        title="View pending change requests"
                      >
                        <Icon name="pending_actions" className="text-[14px]" />
                        {p.pendingChanges.length} pending
                      </Link>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      to={`/products/${p.id}/edit`}
                      className="p-2 rounded-md hover:bg-surface-low text-on-surface-variant"
                      title="Edit"
                    >
                      <Icon name="edit" className="text-[20px]" />
                    </Link>
                    <button
                      onClick={() => remove(p)}
                      className="p-2 rounded-md hover:bg-error/10 text-error"
                      title="Delete"
                    >
                      <Icon name="delete" className="text-[20px]" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}