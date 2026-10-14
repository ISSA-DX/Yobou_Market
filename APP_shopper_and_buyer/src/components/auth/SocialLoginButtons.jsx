/**
 * SocialLoginButtons — Unified social login UI (Google, Apple).
 * Eliminates duplication of button styling and layout.
 * 
 * Features:
 * - Consistent 2-column grid
 * - Loading state support
 * - Optional divider
 * - Accessible labels
 */
import { Link } from 'react-router-dom';
import Icon from '../Icon';

export default function SocialLoginButtons({ loading = false, showDivider = true }) {
  return (
    <>
      {showDivider && (
        <div className="my-5 flex items-center gap-3 text-label-md text-on-surface-variant">
          <div className="flex-1 h-px bg-outline-variant/40" />
          OR CONTINUE WITH
          <div className="flex-1 h-px bg-outline-variant/40" />
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Link
          to="/auth/google"
          className="btn-secondary py-3 disabled:opacity-60 flex items-center justify-center gap-2"
          onClick={(e) => loading && e.preventDefault()}
          aria-disabled={loading}
        >
          <Icon name="account_circle" className="text-[20px]" />
          <span className="hidden sm:inline">Google</span>
        </Link>
        <Link
          to="/auth/apple"
          className="btn-secondary py-3 disabled:opacity-60 flex items-center justify-center gap-2"
          onClick={(e) => loading && e.preventDefault()}
          aria-disabled={loading}
        >
          <Icon name="phone_iphone" className="text-[20px]" />
          <span className="hidden sm:inline">Apple</span>
        </Link>
      </div>
    </>
  );
}
