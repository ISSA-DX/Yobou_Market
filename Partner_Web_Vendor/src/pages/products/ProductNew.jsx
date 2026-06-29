import { useEffect, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import ProductFormFields from '../../components/ProductFormFields';
import { useApi, RetryError } from '../../useApi.jsx';
import { toast } from '../../lib/toast';

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
  const [submitted, setSubmitted] = useState(false);

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
        await api('/api/products', { method: 'POST', body: form });
      }
      setSubmitted(true);
      toast.success('Submitted for review');
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not save product.');
    } finally {
      setBusy(false);
    }
  }

  if (isEdit && productApi.error && !productApi.data) {
    return <RetryError message="Couldn't load product." onRetry={productApi.refetch} />;
  }

  if (submitted) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card p-8 text-center">
          <div className="mx-auto w-20 h-20 rounded-full bg-secondary/20 flex items-center justify-center">
            <Icon name="pending_actions" className="text-secondary text-[40px]" />
          </div>
          <h1 className="mt-5 text-headline-lg font-bold">Submitted for review</h1>
          <p className="mt-2 text-on-surface-variant">
            Your {isEdit ? 'update' : 'new product'} is queued. The admin team reviews changes within 1-2 business days.
            We'll send you a notification once it's approved.
          </p>
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link to="/changes" className="btn-primary py-3">View submission status</Link>
            <Link to="/products" className="btn-secondary py-3">Back to my products</Link>
          </div>
        </div>
      </div>
    );
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
              ? 'Submit changes for admin approval before they go live.'
              : 'Submit a new product. Admin will review and publish it.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/products" className="btn-secondary">Cancel</Link>
          <button onClick={submit} disabled={busy} className="btn-primary">
            {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
            {isEdit ? 'Submit changes' : 'Submit for review'}
          </button>
        </div>
      </div>

      {err && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[20px] shrink-0" />
          <span>{err}</span>
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
              All changes require admin review. You'll be notified once your submission is approved or rejected.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}