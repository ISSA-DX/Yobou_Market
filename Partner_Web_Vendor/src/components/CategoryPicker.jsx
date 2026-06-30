// CategoryPicker — identical implementation across admin and partner apps.
// See Internal_Web_Admin/src/components/CategoryPicker.jsx for design notes.
import { useState } from 'react';
import { useApi } from '../useApi';
import { api } from '../api';
import Modal from './Modal';
import Icon from './Icon';

export default function CategoryPicker({ value, onChange }) {
  const { data, refetch, error } = useApi('/api/categories');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingErr, setCreatingErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const all = data?.categories || [];
  const list = all.filter((c) => c.isActive !== false);

  async function createCategory(e) {
    e?.preventDefault?.();
    if (!newName.trim()) {
      setCreatingErr('Name is required.');
      return;
    }
    setSubmitting(true);
    setCreatingErr('');
    try {
      const { category } = await api('/api/categories', {
        method: 'POST',
        body: { name: newName.trim() },
      });
      await refetch();
      onChange(category.name);
      setNewName('');
      setCreating(false);
    } catch (err) {
      setCreatingErr(err?.data?.message || err?.message || 'Could not create category.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <select
        className="input mt-1 w-full"
        value={value || ''}
        onChange={(e) => {
          if (e.target.value === '__create__') {
            setCreating(true);
            e.target.value = value || '';
          } else {
            onChange(e.target.value);
          }
        }}
      >
        <option value="" disabled>
          Select a category…
        </option>
        {list.map((c) => (
          <option key={c.id} value={c.name}>
            {c.name}{c.productCount != null ? ` (${c.productCount})` : ''}
          </option>
        ))}
        <option value="__create__">+ Create new category…</option>
      </select>

      {error && !data && (
        <div className="text-error text-sm flex items-center gap-1 mt-2">
          <Icon name="error" className="text-[18px]" />
          Couldn't load categories.
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => { setCreating(false); setCreatingErr(''); setNewName(''); }}
        title="Create category"
        footer={
          <>
            <button
              type="button"
              onClick={() => { setCreating(false); setCreatingErr(''); setNewName(''); }}
              className="btn-secondary"
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={createCategory}
              className="btn-primary"
              disabled={submitting}
            >
              {submitting ? 'Creating…' : 'Create'}
            </button>
          </>
        }
      >
        <form onSubmit={createCategory}>
          <label className="text-label-md text-on-surface-variant">Category name</label>
          <input
            autoFocus
            className="input mt-1 w-full"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Outdoor Gear"
            disabled={submitting}
          />
          <p className="text-label-sm text-on-surface-variant mt-2">
            A URL-safe slug is generated automatically from the name.
          </p>
          {creatingErr && (
            <div className="text-error text-sm mt-3">{creatingErr}</div>
          )}
        </form>
      </Modal>
    </>
  );
}