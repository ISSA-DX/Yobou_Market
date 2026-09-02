/**
 * AuthAlternative — Unified component for alternative auth CTAs.
 * Eliminates duplication of the "New to Yobou?" / "Already have an account?" sections.
 * 
 * Features:
 * - Framed card design with high contrast
 * - Primary + secondary action buttons
 * - Accessible heading
 */
import { Link } from 'react-router-dom';
import Icon from '../Icon';

export default function AuthAlternative({
  heading,
  primaryLabel,
  primaryTo,
  secondaryLabel,
  secondaryTo,
  variant = 'primary', // 'primary' | 'secondary'
}) {
  const bgClass = variant === 'primary'
    ? 'bg-primary-container border-2 border-primary/50'
    : 'bg-secondary-container border-2 border-secondary/50';

  return (
    <div className={`mt-6 p-4 rounded-xl ${bgClass}`}>
      <h2 className="text-sm text-center font-semibold uppercase tracking-wide">
        {heading}
      </h2>

      <Link
        to={primaryTo}
        className={`mt-3 inline-flex w-full ${
          variant === 'primary' ? 'btn-primary' : 'btn-secondary'
        } py-3 justify-center font-semibold gap-2`}
      >
        {primaryLabel}
        <Icon name="arrow_forward" className="text-[18px]" />
      </Link>

      {secondaryLabel && secondaryTo && (
        <Link
          to={secondaryTo}
          className="mt-2 block text-center text-label-md text-on-surface-variant hover:text-on-surface font-medium transition-colors"
        >
          {secondaryLabel}
        </Link>
      )}
    </div>
  );
}
