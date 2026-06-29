import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import { toast } from '../../lib/toast';

const KNOWN_CATEGORIES = [
  'Electronics', 'Phones', 'Computers', 'Fashion', 'Shoes', 'Beauty', 'Home', 'Kitchen',
  'Sports', 'Fitness', 'Toys', 'Gaming', 'TV & Audio', 'Appliances', 'Automotive', 'Books',
  'Grocery', 'Health', 'Pet Supplies', 'Baby', 'Jewelry', 'Watches', 'Bags', 'Office',
  'Garden', 'Tools', 'Arts & Crafts', 'Musical',
];

function passwordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

export default function Register() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    businessName: '',
    phone: '',
    licenseUrl: '',
    categories: [],
  });
  const [catInput, setCatInput] = useState('');
  const [show, setShow] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  function update(k, v) { setForm((f) => ({ ...f, [k]: v })); }

  function addCategory() {
    const v = catInput.trim();
    if (!v) return;
    if (form.categories.includes(v)) { setCatInput(''); return; }
    if (form.categories.length >= 20) return;
    setForm((f) => ({ ...f, categories: [...f.categories, v] }));
    setCatInput('');
  }

  function removeCategory(c) {
    setForm((f) => ({ ...f, categories: f.categories.filter((x) => x !== c) }));
  }

  function fillSuggested(c) {
    if (form.categories.includes(c)) return;
    if (form.categories.length >= 20) return;
    setForm((f) => ({ ...f, categories: [...f.categories, c] }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErr(''); setBusy(true);
    try {
      await api('/api/vendors/register', { method: 'POST', body: form, auth: false });
      setSubmitted(true);
      toast.success('Application submitted! Sign in once approved.');
      setTimeout(() => navigate('/login'), 1500);
    } catch (e) {
      setErr(humanizeError(e.data?.error));
    } finally {
      setBusy(false);
    }
  }

  const strength = passwordStrength(form.password);
  const strengthLabel = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'][strength];
  const strengthColor = ['bg-outline', 'bg-error', 'bg-secondary', 'bg-tertiary-container', 'bg-tertiary'][strength];

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface p-6">
        <div className="w-full max-w-md text-center">
          <div className="mx-auto w-24 h-24 rounded-full bg-tertiary-container/30 flex items-center justify-center">
            <Icon name="check_circle" className="text-tertiary text-[44px]" />
          </div>
          <h1 className="mt-6 text-headline-lg font-bold">Application submitted</h1>
          <p className="mt-2 text-on-surface-variant">
            Thanks for applying! Our team reviews each vendor within 1-2 business days.
            We'll email you at <span className="font-semibold text-on-surface">{form.email}</span> once your account is approved.
          </p>
          <div className="mt-8">
            <Link to="/login" className="btn-primary w-full py-3 inline-flex">Continue to sign in</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface py-8 px-4">
      <div className="w-full max-w-xl mx-auto">
        <div className="flex items-center gap-2 mb-6">
          <div className="w-10 h-10 rounded-lg bg-primary text-white flex items-center justify-center font-black text-lg">Y</div>
          <div>
            <div className="font-bold text-xl">Yobou Partner</div>
            <div className="text-label-md text-on-surface-variant">Apply to sell on Yobou</div>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="text-headline-lg font-bold">Vendor application</h1>
          <p className="mt-1 text-on-surface-variant text-sm">Tell us about your business. We'll review your application within 1-2 business days.</p>

          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="text-label-md text-on-surface-variant">Your full name *</label>
              <input className="input mt-1" required value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="Jane Doe" />
            </div>

            <div>
              <label className="text-label-md text-on-surface-variant">Email *</label>
              <input className="input mt-1" type="email" required value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="you@example.com" />
            </div>

            <div>
              <label className="text-label-md text-on-surface-variant">Password *</label>
              <div className="relative mt-1">
                <input
                  className="input pr-10"
                  type={show ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => update('password', e.target.value)}
                  placeholder="At least 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-on-surface-variant"
                  aria-label="Show password"
                >
                  <Icon name={show ? 'visibility_off' : 'visibility'} className="text-[20px]" />
                </button>
              </div>
              {form.password && (
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full bg-surface-low overflow-hidden">
                    <div className={`h-full transition-all ${strengthColor}`} style={{ width: `${(strength / 4) * 100}%` }} />
                  </div>
                  <span className="text-label-sm text-on-surface-variant">{strengthLabel}</span>
                </div>
              )}
            </div>

            <div className="border-t border-outline-variant/30 pt-4">
              <h2 className="font-semibold text-on-surface">Business details</h2>
            </div>

            <div>
              <label className="text-label-md text-on-surface-variant">Business name *</label>
              <input className="input mt-1" required value={form.businessName} onChange={(e) => update('businessName', e.target.value)} placeholder="Acme Goods LLC" />
            </div>

            <div>
              <label className="text-label-md text-on-surface-variant">Phone *</label>
              <input className="input mt-1" required value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="+1 555 123 4567" />
            </div>

            <div>
              <label className="text-label-md text-on-surface-variant">Business license URL (optional)</label>
              <input
                className="input mt-1"
                type="url"
                value={form.licenseUrl}
                onChange={(e) => update('licenseUrl', e.target.value)}
                placeholder="https://example.com/your-license.pdf"
              />
            </div>

            <div>
              <label className="text-label-md text-on-surface-variant">Categories you sell *</label>
              <div className="mt-1 flex gap-2">
                <input
                  className="input"
                  value={catInput}
                  onChange={(e) => setCatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } }}
                  placeholder="Type a category and press Enter"
                />
                <button type="button" onClick={addCategory} className="btn-secondary px-4">Add</button>
              </div>
              {form.categories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {form.categories.map((c) => (
                    <span key={c} className="chip">
                      {c}
                      <button type="button" onClick={() => removeCategory(c)} className="ml-1 text-on-surface-variant hover:text-error" aria-label={`Remove ${c}`}>
                        <Icon name="close" className="text-[14px]" />
                      </button>
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                <span className="text-label-sm text-on-surface-variant mr-1">Suggestions:</span>
                {KNOWN_CATEGORIES.slice(0, 8).map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => fillSuggested(c)}
                    disabled={form.categories.includes(c)}
                    className="text-label-sm px-2 py-1 rounded-full bg-surface-low text-primary hover:bg-surface-high disabled:opacity-40"
                  >
                    + {c}
                  </button>
                ))}
              </div>
            </div>

            {err && <div className="text-error text-sm">{err}</div>}

            <button type="submit" disabled={busy} className="btn-primary w-full py-3 disabled:opacity-60">
              {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
              Submit application
            </button>
          </form>

          <div className="mt-6 text-center text-sm text-on-surface-variant">
            Already have an account?{' '}
            <Link to="/login" className="text-primary font-semibold">Sign in</Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function humanizeError(code) {
  switch (code) {
    case 'EMAIL_TAKEN': return 'An account with that email already exists.';
    case 'INVALID_INPUT': return 'Please check your details and try again.';
    default: return 'Something went wrong. Try again.';
  }
}