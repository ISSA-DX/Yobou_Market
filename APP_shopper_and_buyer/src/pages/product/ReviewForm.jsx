// ReviewForm — the controlled form inside the "Write a review" modal.
//
// Local state for rating/title/body. On submit we call onSubmit({...})
// and let the parent (ReviewsSection) talk to the API. We don't talk
// to the API directly so the parent can refetch + toast without us
// having to lift state up.
//
// Validation here is intentionally light — the server's zod schema is
// the source of truth. We only block obviously-empty submits so the
// user gets instant feedback while typing.
import { useState } from 'react';
import Icon from '../../components/Icon';

export default function ReviewForm({ onSubmit, onCancel, disabled }) {
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const valid = rating >= 1 && title.trim().length > 0 && body.trim().length > 0;

  async function handleSubmit(e) {
    e.preventDefault();
    if (!valid || disabled || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({ rating, title: title.trim(), body: body.trim() });
    } catch (e) {
      setError(e?.message || 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="text-label-md text-on-surface-variant block mb-1">Your rating</label>
        <div
          className="flex items-center gap-1"
          onMouseLeave={() => setHover(0)}
          role="radiogroup"
          aria-label="Star rating"
        >
          {[1, 2, 3, 4, 5].map((n) => {
            const filled = n <= (hover || rating);
            return (
              <button
                key={n}
                type="button"
                onClick={() => setRating(n)}
                onMouseEnter={() => setHover(n)}
                disabled={disabled}
                className="p-1 text-secondary disabled:opacity-50"
                aria-label={`${n} star${n === 1 ? '' : 's'}`}
                aria-checked={rating === n}
                role="radio"
              >
                <Icon name="star" fill={filled} className="text-[28px]" />
              </button>
            );
          })}
          {rating > 0 && (
            <span className="ml-2 text-label-md text-on-surface-variant">
              {rating} / 5
            </span>
          )}
        </div>
      </div>

      <div>
        <label htmlFor="review-title" className="text-label-md text-on-surface-variant block mb-1">
          Headline
        </label>
        <input
          id="review-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          disabled={disabled}
          placeholder="Summarize your experience"
          className="input w-full"
          autoComplete="off"
        />
      </div>

      <div>
        <label htmlFor="review-body" className="text-label-md text-on-surface-variant block mb-1">
          Your review
        </label>
        <textarea
          id="review-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={5}
          disabled={disabled}
          placeholder="What did you like or dislike? How are you using it?"
          className="input w-full resize-y"
        />
        <div className="mt-1 text-label-md text-on-surface-variant text-right">
          {body.length} / 2000
        </div>
      </div>

      {error && (
        <div className="text-label-md text-error">{error}</div>
      )}

      <div className="flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="btn-secondary"
          disabled={submitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn-primary"
          disabled={!valid || submitting || disabled}
        >
          {submitting ? 'Posting…' : 'Post review'}
        </button>
      </div>
    </form>
  );
}
