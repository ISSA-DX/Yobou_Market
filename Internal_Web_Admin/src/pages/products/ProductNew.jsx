// ProductNew — the admin product-create/edit page.
//
// Two columns on lg+:
//   - Left (3/5): ProductFormFields with named, accessible sections.
//   - Right (2/5): a sticky preview aside + publish panel.
//
// Behaviour:
//   - Inline field-level validation (errors map keyed by field name).
//   - localStorage draft autosave (useFormDraft). On mount, if a draft
//     exists we offer to restore it instead of overwriting.
//   - Cancel-with-confirmation when the form is dirty (DirtyGuardModal).
//   - Status select lets the admin save as DRAFT without leaving the
//     page, separate from the prominent "Publish product" CTA.
//   - After a successful save, instead of a blank redirect, we render
//     ProductPublishedSuccess: a two-step confirmation with a deep link
//     to the storefront and an optional "Notify partners" step.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import ProductFormFields from '../../components/ProductFormFields';
import ProductPreviewCard from '../../components/ProductPreviewCard';
import ProductPublishedSuccess from '../../components/ProductPublishedSuccess';
import DirtyGuardModal from '../../components/DirtyGuardModal';
import { useApi, RetryError } from '../../useApi.jsx';
import { useFormDraft } from '../../lib/useFormDraft';

const EMPTY_FORM = {
  name: '',
  description: '',
  category: '',
  priceCents: 0,
  stock: 0,
  imageUrls: [],
  status: 'LIVE',
  // Optional color/size variants. When the array is empty, the legacy
  // single-stock UX is preserved. When non-empty, the server computes
  // Product.stock as sum-of-variant-stock on save.
  variants: [],
};

const DRAFT_KEY = 'yobou-admin-product-draft';

function validate(form) {
  const errors = {};
  if (!form.name.trim()) errors.name = 'Product name is required.';
  if (!form.category || !form.category.trim()) errors.category = 'Pick a category — or create a new one.';
  if (form.priceCents < 0) errors.priceCents = 'Price must be zero or more.';
  // Legacy stock validation only applies when there are no variants —
  // when variants exist, Product.stock is derived server-side and the
  // per-row validation below is what matters.
  const hasVariants = Array.isArray(form.variants) && form.variants.length > 0;
  if (!hasVariants && (form.stock < 0 || !Number.isInteger(form.stock))) {
    errors.stock = 'Stock must be a whole number, zero or more.';
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
  const [savedAt, setSavedAt] = useState(null);
  const [errors, setErrors] = useState({});
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const pendingNavRef = useRef(null);
  const initialFormRef = useRef(null);

  const { pendingDraft, restoreDraft, dismissDraft, clearDraft } = useFormDraft(DRAFT_KEY, form);
  const dirty = useMemo(() => {
    if (!initialFormRef.current) return false;
    return JSON.stringify(form) !== JSON.stringify(initialFormRef.current);
  }, [form]);
  // After a successful save we render the success page instead of the
  // form. Stash the saved product so ProductPublishedSuccess can show
  // the deep link + recipient picker without a refetch.
  const [publishedProduct, setPublishedProduct] = useState(null);
  const [publishedAction, setPublishedAction] = useState(null);

  // Seed form from server response (edit mode) and snapshot the
  // initial value so dirty-tracking has a stable baseline.
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
    setErrors((prev) => ({ ...prev, [k]: undefined })); // clear that field's error on edit
  }

  async function submit({ statusOverride } = {}) {
    const next = statusOverride ? { ...form, status: statusOverride } : form;
    const fieldErrors = validate(next);
    if (Object.keys(fieldErrors).length) {
      setErrors(fieldErrors);
      setErr('Please fix the highlighted fields before publishing.');
      // Move focus to the first invalid field. For variants, scroll to
      // the variants section and focus the first invalid row's color
      // input — otherwise the user has no idea which row is broken.
      const first = Object.keys(fieldErrors)[0];
      if (first === 'variants') {
        document.getElementById('pf-variants')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      let saved;
      if (isEdit) {
        const res = await api(`/api/products/${id}`, { method: 'PATCH', body: next });
        saved = res.product;
      } else {
        const res = await api('/api/products/admin', { method: 'POST', body: next });
        saved = res.product;
      }
      clearDraft();
      setSavedAt(new Date());
      setPublishedProduct(saved);
      setPublishedAction(isEdit ? 'update' : 'create');
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not save product.');
    } finally {
      setBusy(false);
    }
  }

  // Browser-level guard against accidental tab close / refresh while
  // dirty. We only attach the handler when dirty is true so we don't
  // pester the user when nothing has changed.
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

  // After a successful save we hide the form and render the success
  // page. The user is in control: they can navigate away (top nav still
  // works) or stay to notify partners.
  if (publishedProduct) {
    return <ProductPublishedSuccess product={publishedProduct} action={publishedAction} />;
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
              ? 'Update the product details. Changes appear on the storefront immediately.'
              : 'List a product on the Yobou storefront. The cover image is what shoppers see first.'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleCancel} className="btn-secondary">Cancel</button>
          {form.status !== 'LIVE' && (
            <button
              onClick={() => submit({ statusOverride: 'DRAFT' })}
              disabled={busy}
              className="btn-secondary"
            >
              {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
              Save as draft
            </button>
          )}
          <button
            onClick={() => submit({ statusOverride: 'LIVE' })}
            disabled={busy}
            className="btn-primary"
          >
            {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
            <Icon name="publish" className="text-[18px]" />
            {isEdit ? 'Save changes' : 'Publish product'}
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
              This is what shoppers will see in the catalog grid. Updates as you type.
            </p>
          </div>

          <div className="card p-4 space-y-3">
            <div>
              <label htmlFor="pf-status" className="text-label-md text-on-surface-variant">Visibility</label>
              <select
                id="pf-status"
                value={form.status}
                onChange={(e) => update('status', e.target.value)}
                className="input mt-1 w-full"
              >
                <option value="LIVE">Live — visible to customers</option>
                <option value="DRAFT">Draft — hidden, still editing</option>
                <option value="HIDDEN">Hidden — not for sale</option>
              </select>
            </div>

            <div className="text-label-md text-on-surface-variant pt-2 border-t border-outline-variant/30 space-y-1">
              <div>
                {isEdit ? (
                  <>Editing product <strong>#{id.slice(-6)}</strong>.</>
                ) : (
                  <>Selling as <strong>Yobou Direct</strong>.</>
                )}
              </div>
              {savedAt && (
                <div className="flex items-center gap-1 text-tertiary">
                  <Icon name="check_circle" className="text-[14px]" />
                  Saved {savedAt.toLocaleTimeString()}
                </div>
              )}
              <div className="text-label-sm pt-1">
                Your draft auto-saves every 1.5 seconds while you edit.
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