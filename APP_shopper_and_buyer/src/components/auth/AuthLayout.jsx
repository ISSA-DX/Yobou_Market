/**
 * AuthLayout — Unified container for all auth screens (login, register, onboarding).
 * Eliminates duplication of:
 * - Header with Help link
 * - Card wrapper styling  
 * - Spacing and alignment
 * 
 * Usage:
 *   <AuthLayout title="Welcome back" subtitle="Sign in to continue shopping">
 *     Form content here
 *   </AuthLayout>
 */
import { Link } from 'react-router-dom';
import Icon from '../Icon';

export default function AuthLayout({ title, subtitle, children, fullHeight = false }) {
  return (
    <div className={`${fullHeight ? 'min-h-screen' : ''} py-6 auth-page`}>
      {/* Lean header — just Help link, no duplicate branding */}
      <div className="flex items-center justify-end px-4 mb-6">
        <Link
          to="/help"
          className="p-2 rounded-full hover:bg-surface-low transition-colors"
          aria-label="Help"
        >
          <Icon name="help" className="text-[22px] text-on-surface-variant" />
        </Link>
      </div>

      {/* Main content card */}
      <div className="card p-6 max-w-sm mx-auto">
        {title && <h1 className="text-headline-lg font-bold">{title}</h1>}
        {subtitle && <p className="mt-1 text-on-surface-variant">{subtitle}</p>}

        <div className="mt-6">
          {children}
        </div>
      </div>
    </div>
  );
}
