import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';

const STATUS_TONE = {
  PENDING: 'bg-secondary/20 text-on-secondary',
  APPROVED: 'bg-tertiary-container/20 text-tertiary',
  REJECTED: 'bg-error/10 text-error',
};

const ACTION_ICON = {
  CREATE: 'add_box',
  UPDATE: 'edit',
  DELETE: 'delete',
};

const ACTION_LABEL = {
  CREATE: 'New product',
  UPDATE: 'Edit',
  DELETE: 'Removal',
};

export default function Changes() {
  const [filter, setFilter] = useState('PENDING');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const { data, error, loading, refetch } = useApi(
    `/api/product-changes${filter !== 'ALL' ? `?status=${filter}` : ''}`
  );

  const changes = data?.changes || [];
  const counts = useMemo(() => {
    const acc = { PENDING: 0, APPROVED: 0, REJECTED: 0 };
    (data?.changes || []).forEach((c) => { if (acc[c.status] !== undefined) acc[c.status] += 1; });
    return acc;
  }, [data]);

  async function approve(c) {
    setErr(''); setInfo('');
    try {
      await api(`/api/product-changes/${c.id}/approve`, { method: 'POST', body: {} });
      setInfo(`Approved ${ACTION_LABEL[c.action].toLowerCase()} for ${vendorName(c)}.`);
      refetch();
    } catch (e) {
      setErr(e.data?.error || 'Could not approve change.');
    }
  }

  async function reject(c) {
    const note = window.prompt('Rejection note for the vendor (required):');
    if (!note || !note.trim()) return;
    setErr(''); setInfo('');
    try {
      await api(`/api/product-changes/${c.id}/reject`, { method: 'POST', body: { adminNote: note.trim() } });
      setInfo(`Rejected change for ${vendorName(c)}.`);
      refetch();
    } catch (e) {
      setErr(e.data?.error || 'Could not reject change.');
    }
  }

  if (error && !data) {
    return <RetryError message="Couldn't load change requests." onRetry={refetch} />;
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-headline-lg font-bold">Product change requests</h1>
          <p className="text-on-surface-variant text-sm">
            Approve or reject product changes proposed by partners. Approved changes apply to the storefront immediately.
          </p>
        </div>
      </div>

      {err && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[20px] shrink-0" />
          <span>{err}</span>
        </div>
      )}
      {info && (
        <div className="card p-4 bg-tertiary-container/20 text-tertiary text-sm flex items-center gap-2">
          <Icon name="check_circle" className="text-[20px]" />
          <span>{info}</span>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'PENDING', label: `Pending (${counts.PENDING || 0})` },
          { id: 'APPROVED', label: `Approved (${counts.APPROVED || 0})` },
          { id: 'REJECTED', label: `Rejected (${counts.REJECTED || 0})` },
          { id: 'ALL', label: 'All' },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-full text-label-md font-semibold whitespace-nowrap ${filter === t.id ? 'bg-primary text-white' : 'bg-surface-high text-on-surface-variant'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data && (
        <div className="text-center py-12 text-on-surface-variant">
          <Icon name="progress_activity" className="text-[32px] animate-spin" />
        </div>
      )}

      <div className="space-y-3">
        {changes.length === 0 && !loading && (
          <div className="text-center py-12 text-on-surface-variant card">
            <Icon name="inventory_2" className="text-[44px]" />
            <p className="mt-2 text-sm">No change requests in this category.</p>
          </div>
        )}
        {changes.map((c) => (
          <div key={c.id} className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Icon name={ACTION_ICON[c.action] || 'edit'} className="text-[22px]" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold">{ACTION_LABEL[c.action]}</span>
                    <span className="text-on-surface-variant text-sm">·</span>
                    <span className="text-sm text-on-surface-variant">{vendorName(c)}</span>
                    {c.product && (
                      <>
                        <span className="text-on-surface-variant text-sm">·</span>
                        <Link
                          to={`/products/${c.product.id}/edit`}
                          className="text-sm text-primary font-medium line-clamp-1"
                        >
                          {c.product.name}
                        </Link>
                      </>
                    )}
                  </div>
                  <div className="text-label-md text-on-surface-variant mt-0.5">
                    Submitted {new Date(c.createdAt).toLocaleString()}
                  </div>
                </div>
              </div>
              <span className={`chip ${STATUS_TONE[c.status] || ''}`}>{c.status}</span>
            </div>

            <ChangeDiff change={c} />

            {c.adminNote && (
              <div className="bg-error/5 border border-error/20 rounded-md p-3 text-sm">
                <span className="font-semibold text-error">Admin note: </span>
                <span>{c.adminNote}</span>
              </div>
            )}
            {c.reviewedBy && c.reviewedAt && (
              <div className="text-label-md text-on-surface-variant">
                Reviewed by {c.reviewedBy.name} on {new Date(c.reviewedAt).toLocaleString()}
              </div>
            )}

            {c.status === 'PENDING' && (
              <div className="flex gap-2 pt-2 border-t border-outline-variant/20">
                <button onClick={() => approve(c)} className="btn-primary flex-1 py-2">
                  <Icon name="check" /> Approve & apply
                </button>
                <button onClick={() => reject(c)} className="btn-secondary py-2 text-error">
                  <Icon name="close" /> Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangeDiff({ change }) {
  if (change.action === 'DELETE') {
    return (
      <div className="bg-error/5 rounded-md p-3 text-sm">
        Vendor wants to <strong>remove this product</strong>. On approval it will be hidden from the storefront (order history preserved).
      </div>
    );
  }

  const fields = [];
  if (change.proposedName !== null) fields.push({ label: 'Name', value: change.proposedName });
  if (change.proposedDescription !== null && change.action === 'CREATE') {
    fields.push({ label: 'Description', value: change.proposedDescription || '(empty)' });
  }
  if (change.proposedDescription !== null && change.action === 'UPDATE' && change.proposedDescription) {
    fields.push({ label: 'Description', value: change.proposedDescription });
  }
  if (change.proposedPriceCents !== null) {
    fields.push({ label: 'Price', value: `$${(change.proposedPriceCents / 100).toFixed(2)}` });
  }
  if (change.proposedCategory !== null) fields.push({ label: 'Category', value: change.proposedCategory });
  if (change.proposedStock !== null) fields.push({ label: 'Stock', value: change.proposedStock });
  if (change.proposedStatus !== null) fields.push({ label: 'Visibility', value: change.proposedStatus });
  // Placements — only show the row when the vendor touched the flag
  // (null = "leave the existing Product column alone" on UPDATE, the
  // standard proposed* convention). On CREATE any non-null value
  // should render; null falls through to the schema defaults.
  if (change.proposedShowOnHome !== null) {
    fields.push({ label: 'Show on Home', value: change.proposedShowOnHome ? 'On' : 'Off' });
  }
  if (change.proposedShowOnDeals !== null) {
    fields.push({ label: 'Show on Deals', value: change.proposedShowOnDeals ? 'On' : 'Off' });
  }
  if (change.proposedShowOnFlashDeals !== null) {
    fields.push({ label: 'Show on Flash', value: change.proposedShowOnFlashDeals ? 'On' : 'Off' });
  }
  if (change.proposedShowOnSearch !== null) {
    fields.push({ label: 'Show in Search', value: change.proposedShowOnSearch ? 'On' : 'Off' });
  }

  return (
    <div className="bg-surface-low rounded-md p-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
        {fields.map((f) => (
          <div key={f.label}>
            <span className="text-on-surface-variant">{f.label}: </span>
            <span className="font-semibold">{f.value}</span>
          </div>
        ))}
      </div>
      {Array.isArray(change.proposedImageUrls) && change.proposedImageUrls.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto">
          {change.proposedImageUrls.map((url, i) => (
            <img
              key={`${url}-${i}`}
              src={url}
              alt=""
              className="w-16 h-16 rounded-md object-cover bg-surface-high"
            />
          ))}
        </div>
      )}
      {!Array.isArray(change.proposedImageUrls) && change.product?.imageUrls?.[0] && (
        <div className="mt-2">
          <img
            src={productImage(change.product)}
            alt=""
            className="w-16 h-16 rounded-md object-cover bg-surface-high"
          />
        </div>
      )}
      {/* Extra categories — render as a chip row when the vendor
          proposed any. Empty array means "clear all extras", which is
          itself a meaningful edit; null means "leave the existing
          CategoryExtra rows alone" (UPDATE) or "no extras proposed"
          (CREATE). */}
      {Array.isArray(change.proposedExtraCategories) && (
        <div className="mt-2">
          <div className="text-on-surface-variant text-sm">Extra categories: </div>
          {change.proposedExtraCategories.length === 0 ? (
            <div className="text-sm italic text-on-surface-variant mt-0.5">
              (none — will clear all extras)
            </div>
          ) : (
            <ul className="flex flex-wrap gap-1.5 mt-1">
              {change.proposedExtraCategories.map((name) => (
                <li
                  key={name}
                  className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium"
                >
                  {name}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function vendorName(change) {
  return change.vendor?.businessName || 'Unknown vendor';
}