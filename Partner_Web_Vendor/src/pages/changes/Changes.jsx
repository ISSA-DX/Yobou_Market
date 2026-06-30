import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';

const STATUS_STYLES = {
  PENDING: 'bg-secondary/20 text-secondary',
  APPROVED: 'bg-tertiary/20 text-tertiary',
  REJECTED: 'bg-error/10 text-error',
};

const ACTION_ICON = {
  CREATE: 'add_box',
  UPDATE: 'edit',
  DELETE: 'delete',
};

export default function Changes() {
  const [statusFilter, setStatusFilter] = useState('');
  const params = new URLSearchParams();
  if (statusFilter) params.set('status', statusFilter);
  const qs = params.toString();
  const apiPath = useMemo(
    () => `/api/product-changes/mine${qs ? `?${qs}` : ''}`,
    [qs]
  );
  const { data, error, loading, refetch } = useApi(apiPath);

  const changes = data?.changes || [];

  if (error && !data) {
    return <RetryError message="Couldn't load your change requests." onRetry={refetch} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-headline-lg font-bold">My change requests</h1>
        <p className="text-on-surface-variant text-sm">
          The status of every product edit, create, or delete you've submitted.
        </p>
      </div>

      <div className="card p-3 flex items-center gap-1 flex-wrap">
        {[
          { v: '', label: 'All' },
          { v: 'PENDING', label: 'Pending' },
          { v: 'APPROVED', label: 'Approved' },
          { v: 'REJECTED', label: 'Rejected' },
        ].map((s) => (
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

      {loading && !data && (
        <div className="card p-8 text-center text-on-surface-variant">
          <Icon name="progress_activity" className="text-[24px] animate-spin inline-block" />
          <span className="ml-2">Loading changes…</span>
        </div>
      )}

      {!loading && changes.length === 0 && (
        <div className="card p-8 text-center text-on-surface-variant">
          No change requests yet. Edit or add a product to submit one.
          <div className="mt-4">
            <Link to="/products/new" className="btn-primary">Add product</Link>
          </div>
        </div>
      )}

      <div className="grid gap-3">
        {changes.map((c) => {
          const p = c.product || c.proposed || {};
          return (
            <div key={c.id} className="card p-4 flex items-start gap-3">
              {p.imageUrls?.[0] || p.imageUrl ? (
                <img
                  src={productImage(p)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="w-14 h-14 rounded-md object-cover bg-surface-low"
                  onError={(e) => { e.currentTarget.src = `${import.meta.env.BASE_URL}seed-images/placeholder.svg`; }}
                />
              ) : (
                <div className="w-14 h-14 rounded-md bg-surface-low flex items-center justify-center">
                  <Icon name={ACTION_ICON[c.action] || 'edit'} className="text-[24px] text-on-surface-variant" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Icon name={ACTION_ICON[c.action] || 'edit'} className="text-[18px] text-on-surface-variant" />
                  <span className="font-semibold">{c.action}</span>
                  {p.name && <span className="text-on-surface-variant">· {p.name}</span>}
                  <span className={`chip ${STATUS_STYLES[c.status] || ''}`}>{c.status}</span>
                </div>
                {c.adminNote && (
                  <div className="mt-2 p-2 rounded-md bg-surface-low text-sm">
                    <div className="text-label-md text-on-surface-variant">Admin note</div>
                    <div>{c.adminNote}</div>
                  </div>
                )}
                <div className="mt-2 text-label-sm text-on-surface-variant">
                  Submitted {new Date(c.createdAt).toLocaleString()}
                  {c.reviewedAt ? ` · Reviewed ${new Date(c.reviewedAt).toLocaleString()}` : ''}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {data?.total != null && (
        <div className="text-label-md text-on-surface-variant text-center">
          Showing {changes.length} of {data.total}
        </div>
      )}
    </div>
  );
}