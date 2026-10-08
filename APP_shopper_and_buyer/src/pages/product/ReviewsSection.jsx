// ReviewsSection — the "Customer reviews" block on the PDP. Renders
// the average rating, a 5-bar histogram (each bar is a filter
// chip), a sort dropdown, the paginated list, and a "Write a review"
// CTA that opens a modal with the ReviewForm.
//
// Data:
//   GET /api/products/:id/reviews?limit=20&offset=0&sort=recent|highest|lowest&rating=1..5
//   POST /api/products/:id/reviews
//   DELETE /api/reviews/:id
//
// All three are wired. The histogram and the list share the same
// query — clicking a star bar just adds ?rating=N and refetches. The
// total count + breakdown come back on every response so the
// histogram stays accurate as filters change.
import { useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import { useApi, RetryError } from '../../useApi.jsx';
import Icon from '../../components/Icon';
import Modal from '../../lib/Modal';
import { toast } from '../../lib/toast';
import ReviewForm from './ReviewForm';

const SORTS = [
  { value: 'recent',  label: 'Most recent' },
  { value: 'highest', label: 'Highest rated' },
  { value: 'lowest',  label: 'Lowest rated' },
];

export default function ReviewsSection({ productId, onChanged }) {
  const user = useStore((s) => s.user);
  const location = useLocation();
  const [sort, setSort] = useState('recent');
  const [starFilter, setStarFilter] = useState(null); // 1..5 or null
  const [writing, setWriting] = useState(false);

  // Build the query string only when we need it. We always include
  // limit=20 — deep pagination on reviews is rare and the response
  // shape stays simple.
  const path = useMemo(() => {
    const qs = new URLSearchParams();
    qs.set('limit', '20');
    qs.set('sort', sort);
    if (starFilter != null) qs.set('rating', String(starFilter));
    return `/api/products/${productId}/reviews?${qs.toString()}`;
  }, [productId, sort, starFilter]);

  const { data, error, loading, refetch } = useApi(path, { auth: !!user });

  const reviews = data?.reviews || [];
  const total = data?.total || 0;
  const averageRating = data?.averageRating || 0;
  const breakdown = data?.breakdown || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  // The list endpoint returns the first 20 rows. If the user has
  // reviewed and it's on this page, surface it for the "edit your
  // review" affordance in the write modal.
  const myReview = user ? reviews.find((r) => r.user?.id === user.id) || null : null;

  async function handleSubmit({ rating, title, body }) {
    try {
      await api(`/api/products/${productId}/reviews`, {
        method: 'POST',
        body: { rating, title, body },
      });
      toast.success('Review posted. Thanks for the feedback!');
      setWriting(false);
      refetch();
      onChanged?.();
    } catch (e) {
      if (e.status === 409 || e.data?.error === 'REVIEW_EXISTS') {
        toast.error('You already reviewed this product.');
        return;
      }
      toast.error(e.data?.message || e.message || 'Could not post your review.');
    }
  }

  return (
    <section id="reviews" className="px-4 pt-2 pb-6">
      <div className="flex items-end justify-between gap-3 mb-4">
        <div>
          <h2 className="text-title-md font-bold">Customer reviews</h2>
          {total > 0 ? (
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-headline-md font-bold text-primary">
                {Number(averageRating).toFixed(1)}
              </span>
              <div className="flex items-center gap-0.5 text-secondary">
                {[1, 2, 3, 4, 5].map((s) => (
                  <Icon
                    key={s}
                    name="star"
                    fill={s <= Math.round(averageRating)}
                    className="text-[16px]"
                  />
                ))}
              </div>
              <span className="text-label-md text-on-surface-variant">
                {total} review{total === 1 ? '' : 's'}
              </span>
            </div>
          ) : (
            <div className="mt-1 text-label-md text-on-surface-variant/70 italic">
              No reviews yet
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            if (!user) {
              // Bounce to login with the current location so the user
              // lands back here.
              const redirect = encodeURIComponent(location.pathname + location.search);
              window.location.assign(`/login?redirect=${redirect}`);
              return;
            }
            setWriting(true);
          }}
          className="btn-primary"
        >
          <Icon name="rate_review" className="text-[18px]" />
          Write a review
        </button>
      </div>

      {total > 0 && (
        <Histogram
          breakdown={breakdown}
          total={total}
          active={starFilter}
          onPick={(n) => setStarFilter((cur) => (cur === n ? null : n))}
        />
      )}

      {total > 0 && (
        <div className="flex items-center justify-between my-3">
          <div className="text-label-md text-on-surface-variant">
            {starFilter
              ? `Showing ${reviews.length} ${starFilter}-star review${reviews.length === 1 ? '' : 's'}`
              : `Showing ${reviews.length} of ${total}`}
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="reviews-sort" className="text-label-md text-on-surface-variant">Sort</label>
            <select
              id="reviews-sort"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="input py-1.5 px-2 text-sm"
            >
              {SORTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>
      )}

      {error && !data ? (
        <RetryError message="Couldn't load reviews." onRetry={refetch} />
      ) : loading && !data ? (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-4 animate-pulse">
              <div className="h-4 w-1/3 bg-surface-low rounded mb-2" />
              <div className="h-3 w-2/3 bg-surface-low rounded mb-1" />
              <div className="h-3 w-full bg-surface-low rounded" />
            </div>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <div className="text-on-surface-variant/70 italic text-sm py-6 text-center">
          {starFilter
            ? `No ${starFilter}-star reviews yet.`
            : total === 0
              ? 'Be the first to share what you think.'
              : 'No reviews match this filter.'}
        </div>
      ) : (
        <ul id="review-list" className="space-y-3">
          {reviews.map((r) => (
            <ReviewCard key={r.id} review={r} onDelete={async () => {
              if (!window.confirm('Delete this review?')) return;
              try {
                await api(`/api/reviews/${r.id}`, { method: 'DELETE' });
                toast.success('Review removed.');
                refetch();
                onChanged?.();
              } catch (e) {
                toast.error(e.data?.message || 'Could not delete your review.');
              }
            }} canDelete={user && (r.user?.id === user.id || user.role === 'ADMIN')} />
          ))}
        </ul>
      )}

      <Modal
        open={writing}
        onClose={() => setWriting(false)}
        title={myReview ? 'You already reviewed this product' : 'Write a review'}
      >
        {myReview ? (
          <div className="text-sm text-on-surface-variant">
            You posted a {myReview.rating}-star review of this product. Editing isn't supported yet — delete your existing review and post a new one.
          </div>
        ) : (
          <ReviewForm
            onSubmit={handleSubmit}
            onCancel={() => setWriting(false)}
            disabled={!user}
          />
        )}
      </Modal>

      {!user && (
        <p className="mt-3 text-label-md text-on-surface-variant">
          <Link to="/login" className="text-primary font-semibold">Sign in</Link> to write a review.
        </p>
      )}
    </section>
  );
}

function Histogram({ breakdown, total, active, onPick }) {
  return (
    <div className="space-y-1.5 mb-2" aria-label="Rating breakdown">
      {[5, 4, 3, 2, 1].map((n) => {
        const count = breakdown[n] || 0;
        const pct = total > 0 ? Math.round((count / total) * 100) : 0;
        const isActive = active === n;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onPick(n)}
            className={`w-full flex items-center gap-2 text-left rounded-md px-1 py-0.5 transition ${isActive ? 'bg-primary-container/30' : 'hover:bg-surface-low'}`}
            aria-pressed={isActive}
            aria-label={`${n} star${n === 1 ? '' : 's'} — ${count} review${count === 1 ? '' : 's'}`}
          >
            <span className="w-6 text-label-md text-on-surface-variant shrink-0">{n}★</span>
            <div className="flex-1 h-2 bg-surface-low rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full ${isActive ? 'bg-primary' : 'bg-secondary'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-12 text-right text-label-md text-on-surface-variant tabular-nums">
              {pct}%
            </span>
          </button>
        );
      })}
    </div>
  );
}

function ReviewCard({ review, onDelete, canDelete }) {
  const initial = (review.user?.name || '?').trim().charAt(0).toUpperCase();
  const date = new Date(review.createdAt);
  const dateStr = date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  return (
    <li className="card p-4">
      <div className="flex items-center gap-3">
        <div
          className="w-9 h-9 rounded-full bg-primary-container text-primary font-semibold flex items-center justify-center"
          aria-hidden="true"
        >
          {initial}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-semibold text-sm truncate">{review.user?.name || 'Anonymous'}</div>
          <div className="text-label-md text-on-surface-variant flex items-center gap-1.5 flex-wrap">
            {review.verifiedPurchase && (
              <span className="chip bg-tertiary-container/30 text-tertiary text-[10px] py-0">
                <Icon name="verified" className="text-[12px]" /> Verified purchase
              </span>
            )}
            <span>{dateStr}</span>
          </div>
        </div>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="text-label-md text-on-surface-variant hover:text-error"
            aria-label="Delete this review"
            title="Delete"
          >
            <Icon name="delete" className="text-[18px]" />
          </button>
        )}
      </div>
      <div className="mt-2 flex items-center gap-0.5 text-secondary">
        {[1, 2, 3, 4, 5].map((s) => (
          <Icon key={s} name="star" fill={s <= review.rating} className="text-[16px]" />
        ))}
      </div>
      <div className="mt-1.5 font-semibold text-sm">{review.title}</div>
      <p className="mt-1 text-sm text-on-surface-variant whitespace-pre-line">{review.body}</p>
    </li>
  );
}
