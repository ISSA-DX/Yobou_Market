import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../api';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';

const STATUS_TONE = {
  PENDING: 'bg-secondary/20 text-on-secondary',
  PROCESSED: 'bg-tertiary-container/20 text-tertiary',
  APPROVED: 'bg-tertiary-container/20 text-tertiary',
  REJECTED: 'bg-error/10 text-error',
};

export default function Refunds() {
  const [filter, setFilter] = useState('PENDING');
  const [err, setErr] = useState('');
  const [info, setInfo] = useState('');
  const { data, error, loading, refetch } = useApi(
    `/api/refunds${filter !== 'ALL' ? `?status=${filter}` : ''}`
  );

  const refunds = data?.refunds || [];
  const counts = useMemo(() => {
    const acc = { PENDING: 0, PROCESSED: 0, REJECTED: 0 };
    (data?.refunds || []).forEach((r) => { if (acc[r.status] !== undefined) acc[r.status] += 1; });
    return acc;
  }, [data]);

  async function approve(r) {
    setErr(''); setInfo('');
    try {
      await api(`/api/refunds/${r.id}/approve`, { method: 'POST', body: {} });
      setInfo(`Refund approved for ${r.requestedBy?.name || 'customer'}.`);
      refetch();
    } catch (e) {
      setErr(e.data?.error || 'Could not approve refund.');
    }
  }

  async function reject(r) {
    const note = window.prompt('Rejection note for the customer (required):');
    if (!note || !note.trim()) return;
    setErr(''); setInfo('');
    try {
      await api(`/api/refunds/${r.id}/reject`, { method: 'POST', body: { adminNote: note.trim() } });
      setInfo(`Refund rejected.`);
      refetch();
    } catch (e) {
      setErr(e.data?.error || 'Could not reject refund.');
    }
  }

  if (error && !data) {
    return <RetryError message="Couldn't load refund requests." onRetry={refetch} />;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-headline-lg font-bold">Refund requests</h1>
        <p className="text-on-surface-variant text-sm">
          Approve refunds to flip the order to REFUNDED, restore stock, and record the transaction.
        </p>
      </div>

      {err && (
        <div className="card p-4 bg-error/10 text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[20px] shrink-0" />
          <span>{err}</span>
        </div>
      )}
      {info && (
        <div className="card p-4 bg-tertiary-container/20 text-tertiary text-sm flex items-center gap-2">
          <Icon name="check_circle" className="text-[20px]" />
          <span>{info}</span>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {[
          { id: 'PENDING', label: `Pending (${counts.PENDING || 0})` },
          { id: 'PROCESSED', label: `Processed (${counts.PROCESSED || 0})` },
          { id: 'REJECTED', label: `Rejected (${counts.REJECTED || 0})` },
          { id: 'ALL', label: 'All' },
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

      {loading && !data && (
        <div className="text-center py-12 text-on-surface-variant">
          <Icon name="progress_activity" className="text-[32px] animate-spin" />
        </div>
      )}

      <div className="space-y-3">
        {refunds.length === 0 && !loading && (
          <div className="text-center py-12 text-on-surface-variant card">
            <Icon name="assignment_return" className="text-[44px]" />
            <p className="mt-2 text-sm">No refund requests in this category.</p>
          </div>
        )}
        {refunds.map((r) => (
          <div key={r.id} className="card p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold flex items-center gap-2 flex-wrap">
                  {r.requestedBy?.name || 'Customer'}
                  <span className="text-on-surface-variant text-sm font-normal">·</span>
                  <span className="text-on-surface-variant text-sm font-normal">{r.requestedBy?.email}</span>
                </div>
                <div className="text-label-md text-on-surface-variant">
                  Order{' '}
                  <Link to={`/orders/${r.orderId}/track`} className="text-primary font-semibold">
                    #{r.orderId.slice(-6).toUpperCase()}
                  </Link>
                  {' · '}
                  ${(r.amountCents / 100).toFixed(2)} · {new Date(r.createdAt).toLocaleString()}
                </div>
              </div>
              <span className={`chip ${STATUS_TONE[r.status] || ''}`}>{r.status}</span>
            </div>

            <div className="bg-surface-low rounded-md p-3 text-sm">
              <div className="text-label-md text-on-surface-variant mb-1">Reason</div>
              <div>{r.reason}</div>
            </div>

            {r.adminNote && (
              <div className="bg-error/5 border border-error/20 rounded-md p-3 text-sm">
                <span className="font-semibold text-error">Admin note: </span>
                <span>{r.adminNote}</span>
              </div>
            )}
            {r.reviewedBy && r.reviewedAt && (
              <div className="text-label-md text-on-surface-variant">
                Reviewed by {r.reviewedBy.name} on {new Date(r.reviewedAt).toLocaleString()}
                {r.refundTxnId && <> · txn <code>{r.refundTxnId}</code></>}
              </div>
            )}

            {r.status === 'PENDING' && (
              <div className="flex gap-2 pt-2 border-t border-outline-variant/20">
                <button onClick={() => approve(r)} className="btn-primary flex-1 py-2">
                  <Icon name="check" /> Approve & process refund
                </button>
                <button onClick={() => reject(r)} className="btn-secondary py-2 text-error">
                  <Icon name="close" /> Reject
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}