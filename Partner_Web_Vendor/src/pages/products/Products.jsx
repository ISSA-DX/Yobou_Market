import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import Modal from '../../components/Modal';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { useStore } from '../../store';
import { formatPrice } from '../../lib/format';
import { toast } from '../../lib/toast';
import { useProductLiveSync } from '../../lib/useProductLiveSync';

const STATUS_STYLES = {
  LIVE: 'bg-tertiary-container/20 text-tertiary border-0',
  DRAFT: 'bg-secondary/20 text-secondary border-0',
  HIDDEN: 'bg-error/10 text-error border-0',
};

export default function Products() {
  const user = useStore((s) => s.user);
  const currency = user?.currency || 'USD';
  const [q, setQ] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const params = new URLSearchParams();
  if (q) params.set('q', q);
  if (statusFilter) params.set('status', statusFilter);
  const qs = params.toString();
  // Memoize the API path so the string identity is stable across
  // renders — otherwise useApi's useCallback re-creates `run` every
  // time and the wrapping useEffect re-fires in a tight loop, which
  // trips React #321 "Maximum update depth exceeded".
  const apiPath = useMemo(
    () => `/api/products/vendor/mine${qs ? `?${qs}` : ''}`,
    [qs]
  );
  const { data, error, loading, refetch } = useApi(apiPath);
  // Live sync — when an admin approves a vendor change, the product
  // transitions PENDING→LIVE for the partner's "my products" list.
  useProductLiveSync(refetch);

  const [stockModal, setStockModal] = useState(null);
  const [stockValue, setStockValue] = useState('');
  const [stockBusy, setStockBusy] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [actionErr, setActionErr] = useState('');

  const products = data?.products || [];

  async function saveStock() {
    setStockBusy(true);
    setActionErr('');
    try {
      await api(`/api/products/vendor/${stockModal.id}/stock`, {
        method: 'PATCH',
        body: { stock: Math.max(0, Number(stockValue) || 0) },
      });
      toast.success('Stock change submitted for review');
      setStockModal(null);
      refetch();
    } catch (e) {
      setActionErr(e.data?.error || e.message || 'Could not save stock.');
    } finally {
      setStockBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await api(`/api/products/${deleteTarget.id}`, { method: 'DELETE' });
      toast.success('Delete request submitted');
      setDeleteTarget(null);
      refetch();
    } catch (e) {
      setActionErr(e.data?.error || e.message || 'Could not request delete.');
    }
  }

  if (error && !data) {
    return <RetryError message="Couldn't load your products." onRetry={refetch} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <h1 className="text-headline-lg font-bold">My products</h1>
          <p className="text-on-surface-variant text-sm">
            Changes require admin approval before they go live.
          </p>
        </div>
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

      <div className="card p-3 flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]" />
          <input
            className="input pl-10"
            placeholder="Search by name, category, or description"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          {[{ v: '', label: 'All' }, { v: 'LIVE', label: 'Live' }, { v: 'DRAFT', label: 'Draft' }, { v: 'HIDDEN', label: 'Hidden' }].map((s) => (
            <button
              key={s.v}
              onClick={() => setStatusFilter(s.v)}
              className={`px-3 py-1.5 rounded-full text-label-md ${
                statusFilter === s.v ? 'bg-primary text-white' : 'bg-surface-low text-on-surface-variant hover:bg-surface-high'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">Product</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Price</th>
              <th className="px-4 py-3">Stock</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && !data && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">
                  <Icon name="progress_activity" className="text-[24px] animate-spin inline-block" />
                  <span className="ml-2">Loading products…</span>
                </td>
              </tr>
            )}

            {!loading && products.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">
                  {q ? `No products match “${q}”.` : 'No products yet. Add your first product to get started.'}
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
                      loading="lazy"
                      decoding="async"
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
                <td className="px-4 py-3 font-semibold">{formatPrice(p.priceCents, currency)}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => { setStockModal(p); setStockValue(String(p.stock)); }}
                    className="font-semibold hover:bg-surface-low px-2 py-1 rounded-md"
                    title="Quick edit stock"
                  >
                    {p.stock}
                  </button>
                </td>
                <td className="px-4 py-3">
                  <span className={`chip ${STATUS_STYLES[p.status] || STATUS_STYLES.HIDDEN}`}>{p.status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Link
                      to={`/products/${p.id}/edit`}
                      className="p-2 rounded-md hover:bg-surface-low text-on-surface-variant"
                      title="Edit (requires approval)"
                    >
                      <Icon name="edit" className="text-[20px]" />
                    </Link>
                    <button
                      onClick={() => setDeleteTarget(p)}
                      className="p-2 rounded-md hover:bg-error/10 text-error"
                      title="Request delete"
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

      <Modal
        open={Boolean(stockModal)}
        onClose={() => setStockModal(null)}
        title={`Quick stock edit · ${stockModal?.name || ''}`}
        footer={
          <>
            <button onClick={() => setStockModal(null)} className="btn-secondary">Cancel</button>
            <button onClick={saveStock} disabled={stockBusy} className="btn-primary">
              {stockBusy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
              Submit for review
            </button>
          </>
        }
      >
        <p className="text-sm text-on-surface-variant mb-3">
          Quick stock edits are queued as a change request. Admin approval flips the stock atomically.
        </p>
        <label className="text-label-md text-on-surface-variant">New stock level</label>
        <input
          type="number"
          min="0"
          className="input mt-1"
          value={stockValue}
          onChange={(e) => setStockValue(e.target.value)}
          autoFocus
        />
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Request product deletion"
        footer={
          <>
            <button onClick={() => setDeleteTarget(null)} className="btn-secondary">Cancel</button>
            <button onClick={confirmDelete} className="btn-danger">
              Submit delete request
            </button>
          </>
        }
      >
        <p className="text-sm text-on-surface-variant mb-3">
          Deleting <strong>{deleteTarget?.name}</strong> requires admin approval.
          If this product has existing orders, the admin will hide it instead of deleting it
          (so order history stays intact).
        </p>
      </Modal>
    </div>
  );
}