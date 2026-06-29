// Admin user management — list, filter, change role, disable.
//
// The disabled flag is a soft-delete: a disabled user is rejected by
// auth/middleware (loadUser returns null when disabledAt is set), so they
// can't make API calls. Re-enable is the same endpoint with disabled=false.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import Icon from '../../components/Icon';

const ROLES = ['ADMIN', 'VENDOR', 'CUSTOMER'];

export default function Users() {
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [filters, setFilters] = useState({ role: '', q: '' });
  const [page, setPage] = useState(0);
  const limit = 25;

  async function load() {
    setBusy(true); setError('');
    try {
      const qs = new URLSearchParams();
      if (filters.role) qs.set('role', filters.role);
      if (filters.q) qs.set('q', filters.q);
      qs.set('limit', String(limit));
      qs.set('offset', String(page * limit));
      const data = await api(`/api/admin/users?${qs.toString()}`);
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch {
      setError('Could not load users.');
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [page]);

  async function setRole(u, role) {
    if (role === u.role) return;
    if (!confirm(`Change ${u.email} role to ${role}?`)) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { role } });
      await load();
    } catch (e) {
      alert(e?.data?.error === 'CANNOT_DEMOTE_SELF'
        ? 'You cannot demote yourself while you are the only admin.'
        : 'Could not change role.');
    }
  }

  async function toggleDisabled(u) {
    const next = !u.disabledAt;
    const action = next ? 'disable' : 'enable';
    if (!confirm(`${action === 'disable' ? 'Disable' : 'Re-enable'} ${u.email}?`)) return;
    try {
      await api(`/api/admin/users/${u.id}`, { method: 'PATCH', body: { disabled: next } });
      await load();
    } catch (e) {
      alert(e?.data?.error === 'CANNOT_DISABLE_ADMIN'
        ? 'Cannot disable another admin.'
        : `Could not ${action} user.`);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <div className="space-y-5">
      <h1 className="text-headline-lg font-bold">Users</h1>

      <form onSubmit={(e) => { e.preventDefault(); setPage(0); load(); }} className="card p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2">
            <label className="block text-label-md text-on-surface-variant mb-1">Search</label>
            <input
              value={filters.q}
              onChange={(e) => setFilters({ ...filters, q: e.target.value })}
              placeholder="Name or email"
              className="input"
            />
          </div>
          <div>
            <label className="block text-label-md text-on-surface-variant mb-1">Role</label>
            <select
              value={filters.role}
              onChange={(e) => setFilters({ ...filters, role: e.target.value })}
              className="input"
            >
              <option value="">All</option>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-3">
          <button type="button" onClick={() => { setFilters({ role: '', q: '' }); setPage(0); setTimeout(load, 0); }} className="btn-secondary text-sm">Reset</button>
          <button type="submit" className="btn-primary text-sm">Apply</button>
        </div>
      </form>

      {error && (
        <div className="card p-4 bg-error/10 text-error text-sm">{error}</div>
      )}

      <div className="card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-left text-label-md text-on-surface-variant">
            <tr>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Vendor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {busy && users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">
                <Icon name="progress_activity" className="text-[24px] animate-spin" />
              </td></tr>
            )}
            {!busy && users.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-on-surface-variant">No users match.</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-outline-variant/20">
                <td className="px-4 py-3">
                  <div className="font-medium">{u.name}</div>
                  <div className="text-on-surface-variant text-label-sm">{u.email}</div>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => setRole(u, e.target.value)}
                    className="input py-1.5 text-sm"
                    disabled={u.disabledAt}
                  >
                    {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </td>
                <td className="px-4 py-3 text-on-surface-variant">
                  {u.vendor?.businessName || '—'}
                  {u.vendor?.status && (
                    <span className="ml-1 text-label-sm">({u.vendor.status})</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {u.disabledAt ? (
                    <span className="px-2 py-0.5 rounded-full bg-error/10 text-error text-label-md font-bold">
                      Disabled
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-full bg-tertiary/20 text-on-surface text-label-md font-bold">
                      Active
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-on-surface-variant text-label-sm">
                  {new Date(u.createdAt).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-right">
                  {u.disabledAt ? (
                    <button onClick={() => toggleDisabled(u)} className="text-primary font-semibold text-sm">Enable</button>
                  ) : (
                    <button onClick={() => toggleDisabled(u)} className="text-error font-semibold text-sm" disabled={u.role === 'ADMIN'}>
                      Disable
                    </button>
                  )}
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