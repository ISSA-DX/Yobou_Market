import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';

const TONE = {
  PENDING: 'bg-secondary/20 text-on-secondary',
  APPROVED: 'bg-tertiary-container/20 text-tertiary',
  REJECTED: 'bg-error/10 text-error',
};

export default function Vendors() {
  const [vendors, setVendors] = useState([]);
  const [filter, setFilter] = useState('PENDING');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true); setError('');
    try {
      const { vendors } = await api('/api/vendors');
      setVendors(vendors);
    } catch {
      setError('Could not load vendors.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); }, []);

  async function decide(id, status) {
    try {
      await api(`/api/vendors/${id}/status`, { method: 'PATCH', body: { status } });
      await load();
    } catch {
      setError('Could not update vendor status.');
    }
  }

  const visible = vendors.filter((v) => filter === 'ALL' || v.status === filter);
  const counts = vendors.reduce((acc, v) => { acc[v.status] = (acc[v.status] || 0) + 1; return acc; }, {});

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-col sm:flex-row">
        <h1 className="text-headline-lg font-bold">Vendor Approvals</h1>
        <Link to="/vendors/new" className="btn-primary">
          <Icon name="person_add" /> Onboard vendor
        </Link>
      </div>

      {error && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-center justify-between">
          <span>{error}</span>
          <button onClick={load} className="text-primary font-semibold">Retry</button>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'PENDING', label: `Pending (${counts.PENDING || 0})` },
          { id: 'APPROVED', label: `Approved (${counts.APPROVED || 0})` },
          { id: 'REJECTED', label: `Rejected (${counts.REJECTED || 0})` },
          { id: 'ALL', label: `All (${vendors.length})` },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            className={`px-3 py-1.5 rounded-full text-label-md font-semibold whitespace-nowrap ${filter === t.id ? 'bg-primary text-white' : 'bg-surface-high text-on-surface-variant'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {busy && vendors.length === 0 && (
        <div className="text-center py-12 text-on-surface-variant">
          <Icon name="progress_activity" className="text-[32px] animate-spin" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {visible.length === 0 && !busy && (
          <div className="col-span-full text-center py-12 text-on-surface-variant">
            <Icon name="storefront" className="text-[44px]" />
            <p className="mt-2 text-sm">No vendors in this category.</p>
          </div>
        )}
        {visible.map((v) => (
          <div key={v.id} className="card p-5 space-y-3">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-bold text-lg">{v.businessName}</div>
                <div className="text-label-md text-on-surface-variant">{v.user?.name || '—'} · {v.user?.email || '—'}</div>
              </div>
              <span className={`chip ${TONE[v.status] || ''}`}>{v.status}</span>
            </div>
            <div className="text-sm text-on-surface-variant">
              <Icon name="phone" className="text-[14px] mr-1" />
              {v.phone}
            </div>
            <div className="text-label-md text-on-surface-variant">
              Applied {v.createdAt ? new Date(v.createdAt).toLocaleDateString() : '—'}
              {v.approvedAt && ` · Approved ${new Date(v.approvedAt).toLocaleDateString()}`}
            </div>
            {v.status === 'PENDING' && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => decide(v.id, 'APPROVED')} className="btn-primary flex-1 py-2">
                  <Icon name="check" /> Approve
                </button>
                <button onClick={() => decide(v.id, 'REJECTED')} className="btn-secondary flex-1 py-2 text-error">
                  <Icon name="close" /> Reject
                </button>
              </div>
            )}
            {v.status !== 'PENDING' && (
              <div className="flex gap-2 pt-2">
                <button onClick={() => decide(v.id, 'PENDING')} className="btn-ghost flex-1 py-2">
                  Reset to pending
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}