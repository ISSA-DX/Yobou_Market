// Admin audit log — read-only view of admin actions.
//
// Every admin mutation in admin.js (and the cancel/ship paths in orders.js)
// calls audit() to write an entry here. The page supports filtering by
// actor, action, entity type, and date range, with server-side pagination.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import Icon from '../../components/Icon';

const ACTIONS = [
  'order.cancel', 'order.ship', 'order.status', 'order.edit',
  'product.create', 'product.update', 'product.delete',
  'vendor.approve', 'vendor.reject',
  'user.role', 'user.disable',
  'refund.approve', 'refund.reject',
  'broadcast.send',
];

const ENTITY_TYPES = ['order', 'product', 'vendor', 'user', 'refund', 'broadcast'];

export default function AuditLog() {
  const [entries, setEntries] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({
    action: '', actorId: '', entityType: '', entityId: '', from: '', to: '',
  });
  const [page, setPage] = useState(0);
  const limit = 50;

  async function load() {
    setBusy(true); setError('');
    try {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(filters)) if (v) qs.set(k, v);
      qs.set('limit', String(limit));
      qs.set('offset', String(page * limit));
      const data = await api(`/api/admin/audit-log?${qs.toString()}`);
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch {
      setError('Could not load audit log.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-5">
      <h1 className="text-headline-lg font-bold">Audit log</h1>

      <form
        onSubmit={(e) => { e.preventDefault(); setPage(0); load(); }}
        className="card p-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Action</label>
            <select
              value={filters.action}
              onChange={(e) => setFilters({ ...filters, action: e.target.value })}
              className="input"
            >
              <option value="">All</option>
              {ACTIONS.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Entity type</label>
            <select
              value={filters.entityType}
              onChange={(e) => setFilters({ ...filters, entityType: e.target.value })}
              className="input"
            >
              <option value="">All</option>
              {ENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Actor id</label>
            <input
              value={filters.actorId}
              onChange={(e) => setFilters({ ...filters, actorId: e.target.value })}
              className="input"
              placeholder="user_..."
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Entity id</label>
            <input
              value={filters.entityId}
              onChange={(e) => setFilters({ ...filters, entityId: e.target.value })}
              className="input"
              placeholder="…"
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">From</label>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">To</label>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="input" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button
            type="button"
            onClick={() => { setFilters({ action: '', actorId: '', entityType: '', entityId: '', from: '', to: '' }); setPage(0); setTimeout(load, 0); }}
            className="btn-secondary text-sm"
          >
            Reset
          </button>
          <button type="submit" className="btn-primary text-sm">Apply</button>
        </div>
      </form>

      {error && <div className="card p-4 bg-error/10 text-error text-sm">{error}</div>}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Meta</th>
            </tr>
          </thead>
          <tbody>
            {busy && entries.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">
                <Icon name="progress_activity" className="text-[24px] animate-spin" />
              </td></tr>
            )}
            {!busy && entries.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-on-surface-variant">No entries match.</td></tr>
            )}
            {entries.map((e) => (
              <tr key={e.id} className="border-t border-outline-variant/20 align-top">
                <td className="px-4 py-3 text-on-surface-variant text-label-sm whitespace-nowrap">
                  {new Date(e.createdAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{e.actor?.name || '—'}</div>
                  <div className="text-on-surface-variant text-label-sm">{e.actor?.email}</div>
                </td>
                <td className="px-4 py-3">
                  <span className="font-mono text-label-sm bg-surface-high px-1.5 py-0.5 rounded">{e.action}</span>
                </td>
                <td className="px-4 py-3 text-label-sm">
                  <div className="font-medium">{e.entityType}</div>
                  {e.entityId && <div className="text-on-surface-variant font-mono">{e.entityId.slice(-12)}</div>}
                </td>
                <td className="px-4 py-3">
                  {e.meta ? (
                    <pre className="text-label-sm text-on-surface-variant whitespace-pre-wrap break-words max-w-md">
                      {prettyMeta(e.meta)}
                    </pre>
                  ) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <div className="text-sm text-on-surface-variant">
            Showing {page * limit + 1}–{Math.min((page + 1) * limit, total)} of {total}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} className="btn-secondary text-sm disabled:opacity-50">← Previous</button>
            <button onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn-secondary text-sm disabled:opacity-50">Next →</button>
          </div>
        </div>
      )}
    </div>
  );
}

function prettyMeta(raw) {
  // `meta` may be a JSON string or an object depending on Prisma column typing.
  if (typeof raw !== 'string') return JSON.stringify(raw, null, 2);
  try { return JSON.stringify(JSON.parse(raw), null, 2); } catch { return raw; }
}