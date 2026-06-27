import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';

export default function ProfileAddresses() {
  const navigate = useNavigate();
  const { data, error, loading, refetch } = useApi('/api/addresses');
  const [busyId, setBusyId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ recipientName: '', line1: '', city: '', state: '', postal: '', isDefault: true });
  const [saving, setSaving] = useState(false);
  const [formErr, setFormErr] = useState('');

  const addresses = data?.addresses || [];

  function update(k, v) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function save(e) {
    e.preventDefault();
    setSaving(true); setFormErr('');
    try {
      await api('/api/addresses', { method: 'POST', body: form });
      await refetch();
      setShowForm(false);
      setForm({ recipientName: '', line1: '', city: '', state: '', postal: '', isDefault: true });
    } catch (e) {
      setFormErr('Could not save address. Check all fields.');
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(id) {
    setBusyId(id);
    try {
      await api(`/api/addresses/${id}/default`, { method: 'PATCH' });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id) {
    setBusyId(id);
    try {
      await api(`/api/addresses/${id}`, { method: 'DELETE' });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) return <div className="p-8 text-center text-on-surface-variant">Loading…</div>;
  if (error && !data) return <RetryError message="Couldn't load addresses." onRetry={refetch} />;

  return (
    <div className="px-4 pt-4 pb-6 max-w-screen-md mx-auto">
      <header className="flex items-center justify-between mb-5">
        <button onClick={() => navigate('/profile')} className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></button>
        <h1 className="font-bold text-lg">Addresses</h1>
        <span className="w-10" />
      </header>

      <button
        onClick={() => setShowForm((v) => !v)}
        className="w-full card p-4 flex items-center justify-center gap-2 text-primary font-semibold mb-4 hover:bg-surface-low transition"
      >
        <Icon name="add" />
        {showForm ? 'Close form' : 'Add new address'}
      </button>

      {showForm && (
        <form onSubmit={save} className="card p-4 space-y-3 mb-4">
          <h2 className="font-bold">New address</h2>
          <div>
            <label className="text-label-md text-on-surface-variant">Recipient name</label>
            <input className="input mt-1" value={form.recipientName} onChange={(e) => update('recipientName', e.target.value)} required placeholder="Full name" />
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">Street address</label>
            <input className="input mt-1" value={form.line1} onChange={(e) => update('line1', e.target.value)} required placeholder="123 Main St, Apt 4B" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-label-md text-on-surface-variant">City</label>
              <input className="input mt-1" value={form.city} onChange={(e) => update('city', e.target.value)} required />
            </div>
            <div>
              <label className="text-label-md text-on-surface-variant">State</label>
              <input className="input mt-1" value={form.state} onChange={(e) => update('state', e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="text-label-md text-on-surface-variant">Postal code</label>
            <input className="input mt-1" value={form.postal} onChange={(e) => update('postal', e.target.value)} required />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.isDefault} onChange={(e) => update('isDefault', e.target.checked)} className="w-4 h-4 rounded border-outline-variant text-primary" />
            Set as default
          </label>
          {formErr && <div className="text-error text-sm">{formErr}</div>}
          <div className="flex gap-3">
            <button type="button" onClick={() => setShowForm(false)} className="btn-secondary flex-1 py-2.5" disabled={saving}>Cancel</button>
            <button type="submit" className="btn-primary flex-1 py-2.5" disabled={saving}>
              {saving ? <Icon name="progress_activity" className="animate-spin" /> : 'Save address'}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-3">
        {addresses.map((a) => (
          <div key={a.id} className={`card p-4 relative ${a.isDefault ? 'border-primary/40' : ''}`}>
            {a.isDefault && (
              <div className="absolute top-3 right-3 chip bg-primary/10 text-primary border-0 text-[10px]">
                Default
              </div>
            )}
            <div className="font-semibold">{a.recipientName || a.line1}</div>
            <div className="text-sm text-on-surface-variant mt-1">{a.line1}</div>
            <div className="text-sm text-on-surface-variant">{a.city}, {a.state} {a.postal}</div>
            <div className="mt-3 flex items-center gap-2">
              {!a.isDefault && (
                <button
                  onClick={() => setDefault(a.id)}
                  disabled={busyId === a.id}
                  className="text-sm text-primary font-semibold px-3 py-1.5 rounded-full bg-primary/10 disabled:opacity-50"
                >
                  Set default
                </button>
              )}
              <button
                onClick={() => remove(a.id)}
                disabled={busyId === a.id}
                className="text-sm text-error font-semibold px-3 py-1.5 rounded-full bg-error/10 disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {addresses.length === 0 && !showForm && (
          <div className="text-center py-12 text-on-surface-variant">
            <Icon name="home" className="text-[44px] mx-auto" />
            <p className="mt-2">No saved addresses yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
