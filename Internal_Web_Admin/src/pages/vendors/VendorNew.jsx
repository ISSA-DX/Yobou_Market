import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';

const CATEGORY_OPTIONS = [
  'Electronics', 'Fashion', 'Home', 'Beauty', 'Gaming', 'Fitness', 'Books', 'Toys',
];

export default function VendorNew() {
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
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [created, setCreated] = useState(null);

  function update(k, v) { setForm((f) => ({ ...f, [k]: v })); }
  function toggleCat(c) {
    setForm((f) => ({
      ...f,
      categories: f.categories.includes(c)
        ? f.categories.filter((x) => x !== c)
        : [...f.categories, c],
    }));
  }

  async function submit() {
    if (!form.name || !form.email || !form.password || !form.businessName || !form.phone) {
      setErr('Please fill in name, email, password, business name, and phone.');
      return;
    }
    if (form.password.length < 8) {
      setErr('Password must be at least 8 characters.');
      return;
    }
    setBusy(true); setErr('');
    try {
      const body = { ...form };
      if (!body.licenseUrl) delete body.licenseUrl;
      const res = await api('/api/vendors', { method: 'POST', body });
      setCreated(res.vendor);
    } catch (e) {
      setErr(e.data?.error === 'EMAIL_TAKEN'
        ? 'A user with that email already exists.'
        : (e.data?.error || 'Could not create vendor.'));
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    return (
      <div className="space-y-5 max-w-3xl">
        <div className="card p-6 bg-tertiary-container/20 text-tertiary">
          <div className="flex items-center gap-2 mb-2">
            <Icon name="check_circle" className="text-[24px]" />
            <h2 className="font-bold text-lg">Vendor onboarded</h2>
          </div>
          <p className="text-sm text-on-surface">
            <strong>{created.businessName}</strong> has been created with an APPROVED vendor account.
            Share the credentials below with them securely — they can log in immediately.
          </p>
        </div>

        <div className="card p-5 space-y-3">
          <Row label="Business" value={created.businessName} />
          <Row label="Vendor ID" value={created.id} />
          <Row label="Email" value={form.email} />
          <Row label="Initial password" value={form.password} />
          <Row label="Phone" value={form.phone} />
          <Row label="Status" value={created.status} />
          {created.categories?.length > 0 && (
            <Row label="Categories" value={created.categories.join(', ')} />
          )}
        </div>

        <div className="flex gap-2">
          <Link to="/vendors" className="btn-secondary">Back to vendors</Link>
          <button onClick={() => {
            setCreated(null);
            setForm({ name: '', email: '', password: '', businessName: '', phone: '', licenseUrl: '', categories: [] });
          }} className="btn-primary">Onboard another</button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <div className="flex items-center gap-2 text-label-md text-on-surface-variant mb-1">
          <Link to="/vendors" className="hover:text-primary">Vendors</Link>
          <Icon name="chevron_right" className="text-[16px]" />
          <span>New</span>
        </div>
        <h1 className="text-headline-lg font-bold">Onboard a vendor</h1>
        <p className="text-on-surface-variant text-sm">
          Create a vendor account directly. The vendor will be APPROVED and can log in immediately with the initial password.
        </p>
      </div>

      {err && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[20px] shrink-0" />
          <span>{err}</span>
        </div>
      )}

      <div className="card p-5 space-y-4">
        <h2 className="font-bold">Account</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Contact name *">
            <input className="input" value={form.name} onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="Email *">
            <input type="email" className="input" value={form.email} onChange={(e) => update('email', e.target.value)} />
          </Field>
          <Field label="Initial password (min 8) *">
            <input type="text" className="input" value={form.password} onChange={(e) => update('password', e.target.value)} minLength={8} />
          </Field>
          <Field label="Phone *">
            <input className="input" value={form.phone} onChange={(e) => update('phone', e.target.value)} />
          </Field>
        </div>
      </div>

      <div className="card p-5 space-y-4">
        <h2 className="font-bold">Business</h2>
        <Field label="Business name *">
          <input className="input" value={form.businessName} onChange={(e) => update('businessName', e.target.value)} />
        </Field>
        <Field label="License URL (optional)">
          <input className="input" placeholder="https://…" value={form.licenseUrl} onChange={(e) => update('licenseUrl', e.target.value)} />
        </Field>

        <div>
          <div className="text-label-md text-on-surface-variant mb-1">Product categories</div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {CATEGORY_OPTIONS.map((c) => {
              const active = form.categories.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCat(c)}
                  className={`card p-3 text-left text-sm flex items-center gap-2 ${active ? 'border-primary border-2' : ''}`}
                >
                  <Icon name={active ? 'check_circle' : 'radio_button_unchecked'} className={active ? 'text-primary' : 'text-on-surface-variant'} />
                  <span className="font-medium">{c}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={() => navigate('/vendors')} className="btn-secondary">Cancel</button>
        <button onClick={submit} disabled={busy} className="btn-primary">
          {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
          Create vendor
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label className="text-label-md text-on-surface-variant">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between text-sm gap-3">
      <span className="text-on-surface-variant shrink-0">{label}</span>
      <span className="font-mono text-right break-all">{value}</span>
    </div>
  );
}