/**
 * PasswordField — Reusable password input with visibility toggle.
 * Eliminates duplication of the show/hide password toggle across Login and Register.
 * 
 * Features:
 * - Consistent styling with visibility toggle button
 * - Auto-focus support
 * - Optional min length validation
 * - Accessible aria-labels
 */
import { useState } from 'react';
import Icon from '../Icon';

export default function PasswordField({
  label = 'Password',
  value,
  onChange,
  placeholder = '••••••••',
  autoFocus = false,
  minLength = 8,
  required = true,
  hideMinLength = false,
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <label className="text-label-md text-on-surface-variant">
        {label}
        {!hideMinLength && minLength && <span className="text-on-surface-variant/70"> (min {minLength} chars)</span>}
      </label>
      <div className="relative mt-1">
        <input
          className="input pr-10 w-full"
          type={show ? 'text' : 'password'}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          autoFocus={autoFocus}
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant hover:text-on-surface transition-colors"
          aria-label={show ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          <Icon name={show ? 'visibility_off' : 'visibility'} className="text-[20px]" />
        </button>
      </div>
    </div>
  );
}
