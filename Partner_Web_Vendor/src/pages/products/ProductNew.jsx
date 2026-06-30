// ProductNew — the partner (vendor) product-create/edit page.
//
// Vendor flow:
//   - POST /api/products queues a ProductChange (CREATE) for admin
//     approval. The product does NOT go live until an admin approves.
//   - PATCH /api/products/:id queues an UPDATE change.
//   - On success we show a "Submitted for review" page with deep links
//     to /changes and /products.
//
// UX mirrors the admin redesign (two-column layout, accessible
// sections, live preview, draft autosave, dirty-cancel confirmation)
// but the preview shows the vendor's brand name and the Save button
// is "Submit for review" not "Publish".
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import ProductFormFields from '../../components/ProductFormFields';
import ProductPreviewCard from '../../components/ProductPreviewCard';
import DirtyGuardModal from '../../components/DirtyGuardModal';
import { useApi, RetryError } from '../../useApi.jsx';
import { useFormDraft } from '../../lib/useFormDraft';
import { toast } from '../../lib/toast';

const EMPTY_FORM = {
  name: '',
  description: '',
  category: '',
  priceCents: 0,
  stock: 0,
  imageUrls: [],
  status: 'LIVE',
  // Optional color/size variants. When non-empty the admin-approve
  // path writes them to ProductVariant and recomputes Product.stock.
  variants: [],
};

const DRAFT_KEY = 'yobou-partner-product-draft';

function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Product name is required.';
  if (!form.category || !form.category.trim()) errors.category = 'Pick a category.';
  if (form.priceCents < 0) errors.priceCents = 'Price must be zero or more.';
  const hasVariants = Array.isArray(form.variants) && form.variants.length > 0;
  if (!hasVariants && (form.stock < 0 || !Number.isInteger(form.stock))) {
    errors.stock = 'Stock must be a whole number.';
  }
  if (hasVariants) {
    const rowErrors = form.variants.map((v) => {
      if (!v.color || !v.color.trim()) return 'Color is required.';
      if (!v.size || !v.size.trim()) return 'Size is required.';
      if (!Number.isFinite(v.stock) || v.stock < 0 || !Number.isInteger(v.stock)) return 'Stock must be a whole number, zero or more.';
      return null;
    });
    if (rowErrors.some(Boolean)) {
      errors.variants = { variants: 'Some variant rows need attention.', rows: rowErrors };
    }
  }
  return errors;
}

export default function ProductNew() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = Boolean(id);

  const productApi = useApi(isEdit ? `/api/products/${id}` : null, { skip: !isEdit });
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const initialFormRef = useRef(null);

  const { pendingDraft, restoreDraft, dismissDraft, clearDraft } = useFormDraft(DRAFT_KEY, form);
  const dirty = useMemo(() => {
    if (!initialFormRef.current) return false;
    return JSON.stringify(form) !== JSON.stringify(initialFormRef.current);
  }, [form]);

  useEffect(() => {
    if (productApi.data?.product) {
      const p = productApi.data.product;
      const next = {
        name: p.name || '',
        description: p.description || '',
        category: p.category || '',
        priceCents: p.priceCents || 0,
        stock: p.stock || 0,
        imageUrls: Array.isArray(p.imageUrls) ? p.imageUrls : [],
        status: p.status || 'LIVE',
        variants: Array.isArray(p.variants)
          ? p.variants.map((v) => ({ id: v.id, color: v.color, size: v.size, stock: v.stock }))
          : [],
      };
      setForm(next);
      initialFormRef.current = JSON.stringify(next);
    }
  }, [productApi.data]);

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((prev) => ({ ...prev, [k]: undefined }));
  }

  async function submit() {
    const fieldErrors = validate(form);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      setErr('Please fix the highlighted fields before submitting.');
      const first = Object.keys(fieldErrors)[0];
      if (first === 'variants') {
        document.querySelector('[aria-labelledby="pf-variants-accordion"]')
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        const rowIdx = fieldErrors.variants.rows.findIndex(Boolean);
        const input = rowIdx >= 0
          ? document.querySelector(`input[aria-label="Variant ${rowIdx + 1} color"]`)
          : null;
        input?.focus?.();
      } else {
        const el = document.getElementById(`pf-${first}`);
        el?.focus?.();
        el?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
      }
      return;
    }
    setErrors({});
    setBusy(true);
    setErr('');
    try {
      if (isEdit) {
        await api(`/api/products/${id}`, { method: 'PATCH', body: form });
      } else {
        await api('/api/products', { method: 'POST', body: form });
      }
      clearDraft();
      toast.success('Submitted for review');
      setSubmitted(true);
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not submit product.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!dirty) return undefined;
    function onBeforeUnload(e) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  function handleCancel() {
    if (!dirty) {
      navigate('/products');
      return;
    }
    setConfirmDiscard(true);
  }

  function confirmDiscardAndLeave() {
    setConfirmDiscard(false);
    clearDraft();
    navigate('/products');
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
            Your {isEdit ? 'update' : 'new product'} is queued. The admin team reviews changes within 1–2 business days.
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
    <div className="space-y-5 max-w-6xl">
      {/* ───── Header ───── */}
      <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
        <div>
          <div className="flex items-center gap-2 text-label-md text-on-surface-variant mb-1">
            <Link to="/products" className="hover:text-primary">Products</Link>
            <Icon name="chevron_right" className="text-[16px]" />
            <span>{isEdit ? 'Edit' : 'New'}</span>
          </div>
          <h1 className="text-headline-lg font-bold">
            {isEdit ? 'Edit product' : 'Add a new product'}
          </h1>
          <p className="text-on-surface-variant text-sm">
            {isEdit
              ? 'Submit changes for admin approval before they go live.'
              : 'Submit a new product. An admin will review and publish it.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCancel} className="btn-secondary">Cancel</button>
          <button onClick={submit} disabled={busy} className="btn-primary">
            {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
            <Icon name="send" className="text-[18px]" />
            {isEdit ? 'Submit changes' : 'Submit for review'}
          </button>
        </div>
      </div>

      {/* ───── Top-level errors ───── */}
      {err && (
        <div role="alert" aria-live="polite" className="card p-4 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[20px] shrink-0" />
          <span>{err}</span>
        </div>
      )}

      {/* ───── Draft restore prompt ───── */}
      {pendingDraft && (
        <div className="card p-4 bg-secondary/10 text-on-surface flex items-start gap-3">
          <Icon name="history" className="text-[22px] shrink-0 text-secondary" />
          <div className="flex-1 text-sm">
            <div className="font-semibold">Restore unsaved draft?</div>
            <div className="text-on-surface-variant mt-1">
              You started filling in a product earlier. Your draft is {timeAgo(pendingDraft.savedAt)}.
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button
                type="button"
                className="btn-primary py-1 px-3 text-sm"
                onClick={() => {
                  const draft = restoreDraft();
                  if (draft) setForm(draft);
                }}
              >
                Restore draft
              </button>
              <button
                type="button"
                className="btn-secondary py-1 px-3 text-sm"
                onClick={dismissDraft}
              >
                Discard draft
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ───── Main two-column layout ───── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="lg:col-span-3 card p-5">
          <ProductFormFields form={form} update={update} errors={errors} />
        </div>

        <aside className="lg:col-span-2 space-y-4 lg:sticky lg:top-4 lg:self-start">
          <div className="card p-4">
            <div className="text-label-md text-on-surface-variant mb-2">Live preview</div>
            <ProductPreviewCard form={form} />
            <p className="text-label-sm text-on-surface-variant mt-3">
              This is what shoppers will see after an admin approves your submission.
            </p>
          </div>

          <div className="card p-4 space-y-3">
            <div className="text-label-md text-on-surface-variant pt-2 border-t border-outline-variant/30 space-y-1">
              <div>
                {isEdit ? <>Editing product <strong>#{id.slice(-6)}</strong>.</> : <>New product submission.</>}
              </div>
              <div className="text-label-sm pt-1">
                Your draft auto-saves every 1.5 seconds while you edit.
              </div>
              <div className="text-label-sm">
                All submissions require admin review. You'll be notified once approved or rejected.
              </div>
            </div>
          </div>
        </aside>
      </div>

      <DirtyGuardModal
        open={confirmDiscard}
        onKeep={() => setConfirmDiscard(false)}
        onDiscard={confirmDiscardAndLeave}
      />
    </div>
  );
}

function timeAgo(ts) {
  const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
  if (s < 60) return `${s} second${s === 1 ? '' : 's'} ago`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m} minute${m === 1 ? '' : 's'} ago`;
  const h = Math.round(m / 60);
  return `${h} hour${h === 1 ? '' : 's'} ago`;
}