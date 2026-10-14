/**
 * Auth error messages — centralized, consistent error handling across all auth flows.
 * Replaces duplicated humanizeError functions in Login and Register.
 * Provides helpful, actionable messages for common auth errors.
 */

export function humanizeAuthError(code, context = 'login') {
  const messages = {
    EMAIL_TAKEN: 'An account with that email already exists.',
    EMAIL_NOT_FOUND: 'No account found with that email. Create an account or try another email.',
    INVALID_PASSWORD: 'Incorrect password. Please try again or use "Forgot password?"',
    INVALID_INPUT: 'Please check your details and try again.',
    INVALID_EMAIL: 'Please enter a valid email address.',
    PASSWORD_TOO_SHORT: 'Password must be at least 8 characters.',
    PASSWORD_MISMATCH: 'Passwords do not match.',
    UNAUTHENTICATED: 'Session expired. Please sign in again.',
    INSUFFICIENT_PERMISSIONS: 'You do not have permission to access this feature.',
    NETWORK_ERROR: 'Network error. Please check your connection and try again.',
    SERVER_ERROR: 'Something went wrong on our end. Please try again later.',
  };

  return messages[code] || messages.SERVER_ERROR;
}

export function isRetryableError(code) {
  return ['NETWORK_ERROR', 'SERVER_ERROR', 'UNAUTHENTICATED'].includes(code);
}

export function isClientError(code) {
  return [
    'EMAIL_TAKEN',
    'EMAIL_NOT_FOUND',
    'INVALID_PASSWORD',
    'INVALID_INPUT',
    'INVALID_EMAIL',
    'PASSWORD_TOO_SHORT',
    'PASSWORD_MISMATCH',
  ].includes(code);
}
