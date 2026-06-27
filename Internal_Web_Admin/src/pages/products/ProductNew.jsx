import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import ProductFormFields from '../../components/ProductFormFields';
import { useApi, RetryError } from '../../useApi.jsx';

const EMPTY_FORM = {
  name: '',
  description: '',
  category: 'Electronics',
  priceCents: 0,
  stock: 0,
  imageUrls: [],
  status: 'LIVE',
};

export default function ProductNew() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const productApi = useApi(isEdit ? `/api/products/${id}` : null, { skip: !isEdit });

  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (productApi.data?.product) {
      const p = productApi.data.product;
      setForm({
        name: p.name || '',
        description: p.description || '',
        category: p.category || 'Electronics',
        priceCents: p.priceCents || 0,
        stock: p.stock || 0,
        imageUrls: Array.isArray(p.imageUrls) ? p.imageUrls : [],
        status: p.status || 'LIVE',
      });
    }
  }, [productApi.data]);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setSaved(false);
  }

  async function submit() {
    if (!form.name.trim() || !form.category.trim()) {
      setErr('Please fill in the product name and category.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      if (isEdit) {
        await api(`/api/products/${id}`, { method: 'PATCH', body: form });
      } else {
        await api('/api/products/admin', { method: 'POST', body: form });
      }
      setSaved(true);
      setTimeout(() => navigate('/products'), 600);
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not save product.');
    } finally {
      setBusy(false);
    }
  }

  if (isEdit && productApi.error && !productApi.data) {
    return <RetryError message="Couldn't load product." onRetry={productApi.refetch} />;
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <div className="flex items-center gap-2 text-label-md text-on-surface-variant mb-1">
            <Link to="/products" className="hover:text-primary">Products</Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <span>{isEdit ? 'Edit' : 'New'}</span>
          </div>
          <h1 className="text-headline-lg font-bold">{isEdit ? 'Edit product' : 'Add product'}</h1>
          <p className="text-on-surface-variant text-sm">
            {isEdit
              ? 'Update the product details. Changes appear on the storefront immediately.'
              : 'List a new product manually from partner information.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/products" className="btn-secondary">Cancel</Link>
          <button onClick={submit} disabled={busy} className="btn-primary">
            {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
            {isEdit ? 'Save changes' : 'Publish product'}
          </button>
        </div>
      </div>

      {err && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[20px] shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {saved && (
        <div className="card p-4 bg-tertiary-container/20 text-tertiary text-sm flex items-center gap-2">
          <Icon name="check_circle" className="text-[20px]" />
          <span>Product saved. Redirecting…</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 card p-5 space-y-4">
          <h2 className="font-bold">General information</h2>
          <ProductFormFields form={form} update={update} />
        </div>

        <div className="card p-5 space-y-4 h-fit">
          <h2 className="font-bold">Visibility</h2>
          <div className="space-y-3">
            <div>
              <label className="text-label-md text-on-surface-variant">Status</label>
              <select
                value={form.status}
                onChange={(e) => update('status', e.target.value)}
                className="input mt-1 w-full"
              >
                <option value="LIVE">Live — visible to customers</option>
                <option value="DRAFT">Draft — hidden, still editing</option>
                <option value="HIDDEN">Hidden — not for sale</option>
              </select>
            </div>
            <div className="text-label-md text-on-surface-variant pt-2 border-t border-outline-variant/30">
              {isEdit ? (
                <>
                  Editing product <strong>#{id.slice(-6)}</strong>.
                  <br />
                  Only admins can change vendor products.
                </>
              ) : (
                <>
                  Selling as <strong>Yobou Direct</strong> (no vendor).
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}