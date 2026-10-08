# Auth UI Components — Quick Reference Guide

## 🎨 Component Overview

```
AuthLayout (base container)
├── AuthLayout.jsx — Wraps all pages
├── PasswordField.jsx — Reusable password input
├── SocialLoginButtons.jsx — Google + Apple buttons
└── AuthAlternative.jsx — CTA cards
```

---

## 📦 AuthLayout Component

**Purpose:** Single, consistent container for all auth screens

**Import:**
```jsx
import AuthLayout from '../../components/auth/AuthLayout';
```

**Usage:**
```jsx
<AuthLayout
  title="Welcome back"
  subtitle="Sign in to continue shopping"
>
  {/* Your form content here */}
  <form>{/* ... */}</form>
  <SocialLoginButtons />
</AuthLayout>
```

**Props:**
- `title` (string) — Main heading
- `subtitle` (string) — Subheading
- `children` (React.ReactNode) — Form content
- `fullHeight` (boolean, optional) — Full viewport height

**Features:**
- ✓ Help link in header
- ✓ Consistent card styling
- ✓ Centered layout
- ✓ Mobile-optimized padding

---

## 🔐 PasswordField Component

**Purpose:** Reusable password input with show/hide toggle

**Import:**
```jsx
import PasswordField from '../../components/auth/PasswordField';
```

**Usage:**
```jsx
<PasswordField
  label="Password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  minLength={8}
  hideMinLength={false}
/>
```

**Props:**
- `label` (string, default: "Password") — Field label
- `value` (string) — Form value
- `onChange` (function) — Change handler
- `placeholder` (string, default: "••••••••")
- `autoFocus` (boolean, default: false)
- `minLength` (number, default: 8)
- `required` (boolean, default: true)
- `hideMinLength` (boolean, default: false) — Hide length hint

**Features:**
- ✓ Show/hide toggle button
- ✓ Accessibility labels
- ✓ Min length hints
- ✓ Keyboard navigation (tabindex=-1)
- ✓ Touch-friendly toggle

---

## 📱 SocialLoginButtons Component

**Purpose:** Unified social login button set

**Import:**
```jsx
import SocialLoginButtons from '../../components/auth/SocialLoginButtons';
```

**Usage:**
```jsx
<SocialLoginButtons loading={busy} showDivider={true} />
```

**Props:**
- `loading` (boolean, default: false) — Disable during loading
- `showDivider` (boolean, default: true) — Show "OR CONTINUE WITH" divider

**Features:**
- ✓ 2-column grid layout
- ✓ Google + Apple buttons
- ✓ Icon + text labels
- ✓ Links to OAuth handlers
- ✓ Responsive design

**Routes:**
- Google → `/auth/google` → GooglePicker.jsx
- Apple → `/auth/apple` → AppleConfirm.jsx

---

## 🎯 AuthAlternative Component

**Purpose:** Alternative CTA card (for switching between flows)

**Import:**
```jsx
import AuthAlternative from '../../components/auth/AuthAlternative';
```

**Usage:**
```jsx
<AuthAlternative
  heading="New to Yobou?"
  primaryLabel="Create account"
  primaryTo="/register"
  secondaryLabel="Continue as guest"
  secondaryTo="#"
  variant="primary"
/>
```

**Props:**
- `heading` (string) — Card heading
- `primaryLabel` (string) — Main CTA text
- `primaryTo` (string) — Link destination
- `secondaryLabel` (string, optional) — Secondary link text
- `secondaryTo` (string, optional) — Secondary link destination
- `variant` (string: "primary" | "secondary", default: "primary")

**Features:**
- ✓ Framed card design
- ✓ Primary + secondary actions
- ✓ Color variants (primary/secondary)
- ✓ Accessible h2 heading
- ✓ High contrast styling

---

## 🚨 authErrors Utility

**Purpose:** Centralized error messages and classification

**Import:**
```jsx
import { 
  humanizeAuthError, 
  isRetryableError, 
  isClientError 
} from '../../lib/authErrors';
```

**Usage:**
```jsx
try {
  await login(email, password);
} catch (e) {
  const msg = humanizeAuthError(e.data?.error || 'SERVER_ERROR');
  setErr(msg);
}
```

**Error Codes:**
```
EMAIL_TAKEN
EMAIL_NOT_FOUND
INVALID_PASSWORD
INVALID_INPUT
INVALID_EMAIL
PASSWORD_TOO_SHORT
PASSWORD_MISMATCH
UNAUTHENTICATED
INSUFFICIENT_PERMISSIONS
NETWORK_ERROR
SERVER_ERROR
```

**Helper Functions:**
```jsx
// Check if error is retryable (network, server, auth)
if (isRetryableError(code)) {
  // Show retry button
}

// Check if error is client error (user input, validation)
if (isClientError(code)) {
  // Highlight form field
}
```

---

## 🔄 Example: Full Login Page

```jsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AuthLayout from '../../components/auth/AuthLayout';
import PasswordField from '../../components/auth/PasswordField';
import SocialLoginButtons from '../../components/auth/SocialLoginButtons';
import AuthAlternative from '../../components/auth/AuthAlternative';
import { humanizeAuthError } from '../../lib/authErrors';

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      await login(email, password);
      navigate('/home');
    } catch (e) {
      setErr(humanizeAuthError(e.data?.error || 'SERVER_ERROR'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue shopping"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Email field */}
        <div>
          <label className="text-label-md text-on-surface-variant">Email</label>
          <input
            className="input mt-1 w-full"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        {/* Password field (reusable component) */}
        <PasswordField
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          hideMinLength
        />

        {/* Error display */}
        {err && (
          <div className="text-error text-sm p-3 bg-error/10 rounded-lg">
            {err}
          </div>
        )}

        {/* Submit button */}
        <button
          type="submit"
          disabled={busy}
          className="btn-primary w-full py-3 disabled:opacity-60"
        >
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      {/* Social login (reusable component) */}
      <SocialLoginButtons loading={busy} />

      {/* Alternative CTA (reusable component) */}
      <AuthAlternative
        heading="New to Yobou?"
        primaryLabel="Create account"
        primaryTo="/register"
        variant="primary"
      />
    </AuthLayout>
  );
}
```

---

## 📐 Component Layout Reference

### AuthLayout Wrapper
```
┌─ AuthLayout ──────────────────────┐
│                                   │
│  [?]         Help link (right)    │  ← Header
│                                   │
│  ┌─ Card ────────────────────┐   │
│  │                           │   │
│  │ Title (h1)                │   │
│  │ Subtitle text             │   │
│  │                           │   │
│  │ {/* children go here */}  │   │  ← Content area
│  │                           │   │
│  └───────────────────────────┘   │
│                                   │
└───────────────────────────────────┘
```

### Login/Register Form
```
Title & Subtitle
  ↓
Email field
  ↓
Password field (PasswordField component)
  ↓
Error message (if present)
  ↓
Submit button
  ↓
Social buttons (SocialLoginButtons component)
  ↓
Alternative CTA (AuthAlternative component)
```

---

## 🎨 Styling Reference

### Error Display
```jsx
{err && (
  <div className="text-error text-sm p-3 bg-error/10 rounded-lg">
    {err}
  </div>
)}
```

### Loading State
```jsx
{busy && <Icon name="progress_activity" className="animate-spin" />}
```

### Button Disabled
```jsx
<button disabled={busy} className="disabled:opacity-60">
```

### Form Field
```jsx
<input className="input mt-1 w-full" />
```

---

## ✅ Testing Checklist

### Component Tests
- [ ] AuthLayout renders title + subtitle
- [ ] AuthLayout renders Help link
- [ ] PasswordField shows/hides password
- [ ] PasswordField validates min length
- [ ] SocialLoginButtons links to OAuth routes
- [ ] AuthAlternative renders both actions
- [ ] authErrors returns correct messages

### Integration Tests
- [ ] Login form submits
- [ ] Register form creates account
- [ ] Errors display correctly
- [ ] Loading state shows during submit
- [ ] Social login buttons work
- [ ] Alternative CTAs navigate

### Manual Tests
- [ ] Mobile layout responsive
- [ ] Keyboard navigation works
- [ ] Screen reader reads labels
- [ ] Touch targets 48px+
- [ ] Color contrast 4.5:1+

---

## 🚀 Quick Start

1. **Import components in your page:**
   ```jsx
   import AuthLayout from '../../components/auth/AuthLayout';
   import PasswordField from '../../components/auth/PasswordField';
   ```

2. **Wrap your form in AuthLayout:**
   ```jsx
   <AuthLayout title="Your Title" subtitle="Your Subtitle">
     {/* form content */}
   </AuthLayout>
   ```

3. **Use PasswordField for passwords:**
   ```jsx
   <PasswordField value={pwd} onChange={setPwd} />
   ```

4. **Add social buttons:**
   ```jsx
   <SocialLoginButtons loading={busy} />
   ```

5. **Handle errors:**
   ```jsx
   import { humanizeAuthError } from '../../lib/authErrors';
   setErr(humanizeAuthError(e.data?.error));
   ```

---

## 📞 Support

For questions or issues:
- Check component props in files
- See example implementations
- Review documentation files (AUTH_*.md)
- Test on mobile and desktop

---
