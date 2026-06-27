import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import CardForm from '../../components/CardForm';
import { useApi, RetryError } from '../../useApi.jsx';

const BRAND_ICON = {
  visa: 'credit_card',
  mastercard: 'credit_card',
  amex: 'credit_card',
  discover: 'credit_card',
  card: 'credit_card',
};

export default function ProfileCards() {
  const navigate = useNavigate();
  const { data, error, loading, refetch } = useApi('/api/payments');
  const [showForm, setShowForm] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [formErr, setFormErr] = useState('');

  const methods = data?.methods || [];

  async function addCard(card) {
    setFormErr('');
    try {
      await api('/api/payments', {
        method: 'POST',
        body: {
          number: card.number,
          name: card.name,
          expiry: card.expiry,
          cvv: card.cvv,
          isDefault: methods.length === 0 || card.save,
        },
      });
      await refetch();
      setShowForm(false);
    } catch (e) {
      setFormErr('Could not save card. Please check the details.');
      throw e;
    }
  }

  async function setDefault(id) {
    setBusyId(id);
    try {
      await api(`/api/payments/${id}/default`, { method: 'PATCH' });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id) {
    setBusyId(id);
    try {
      await api(`/api/payments/${id}`, { method: 'DELETE' });
      await refetch();
    } finally {
      setBusyId(null);
    }
  }

  if (loading && !data) return <div className="p-8 text-center text-on-surface-variant">Loading…</div>;
  if (error && !data) return <RetryError message="Couldn't load payment methods." onRetry={refetch} />;

  return (
    <div className="px-4 pt-4 pb-6 max-w-screen-md mx-auto">
      <header className="flex items-center justify-between mb-5">
        <button onClick={() => navigate('/profile')} className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></button>
        <h1 className="font-bold text-lg">Payment methods</h1>
        <span className="w-10" />
      </header>

      <button
        onClick={() => setShowForm((v) => !v)}
        className="w-full card p-4 flex items-center justify-center gap-2 text-primary font-semibold mb-4 hover:bg-surface-low transition"
      >
        <Icon name="add" />
        {showForm ? 'Close form' : 'Add new card'}
      </button>

      {showForm && (
        <div className="card p-4 mb-4">
          {formErr && <div className="text-error text-sm mb-3">{formErr}</div>}
          <CardForm
            onSubmit={addCard}
            submitLabel="Save card"
          />
        </div>
      )}

      <div className="space-y-3">
        {methods.map((m) => (
          <div key={m.id} className={`card p-4 flex items-center gap-3 relative ${m.isDefault ? 'border-primary/40' : ''}`}>
            <div className="w-12 h-12 rounded-lg bg-surface-low flex items-center justify-center text-primary">
              <Icon name={BRAND_ICON[m.brand] || 'credit_card'} className="text-[28px]" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold capitalize">{m.brand} ending in {m.last4}</div>
              <div className="text-sm text-on-surface-variant">Expires {m.expiryMonth}/{m.expiryYear}</div>
            </div>
            <div className="flex flex-col items-end gap-2">
              {m.isDefault ? (
                <span className="chip bg-primary/10 text-primary border-0 text-[10px]">Default</span>
              ) : (
                <button
                  onClick={() => setDefault(m.id)}
                  disabled={busyId === m.id}
                  className="text-xs text-primary font-semibold px-2 py-1 rounded bg-primary/10 disabled:opacity-50"
                >
                  Set default
                </button>
              )}
              <button
                onClick={() => remove(m.id)}
                disabled={busyId === m.id}
                className="text-xs text-error font-semibold px-2 py-1 rounded bg-error/10 disabled:opacity-50"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
        {methods.length === 0 && !showForm && (
          <div className="text-center py-12 text-on-surface-variant">
            <Icon name="credit_card" className="text-[44px] mx-auto" />
            <p className="mt-2">No saved cards yet.</p>
          </div>
        )}
      </div>
    </div>
  );
}
