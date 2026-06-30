// CategoryPicker
// ---------------------------------------------------------------------------
// Custom dropdown for product categories. The previous native <select>
// implementation rendered the full list correctly, but the disabled
// "Select a category…" placeholder option read like an empty list — users
// reported seeing nothing. This version is fully custom.
//
// Why show-all-by-default: with the seed catalogue of 5–10 categories, a
// filter-first pattern actively misleads users. Typing "Phone" (which is
// not a category) hides every row and leaves "Other — Create new category"
// as the only actionable thing, so users end up creating duplicate
// categories. We render the full list immediately. A search icon in the
// panel header opens a filter input on demand for power users.
//
// Why this lives in each app separately rather than in a shared package:
// the three apps (admin / partner / shopper) are separate Vite projects,
// not a monorepo. The three implementations are kept identical by copy.
//
// Behaviour summary:
//   - Reads the curated list from GET /api/categories (admin-curated).
//   - Click the trigger → opens the floating panel with the full list.
//   - ↑/↓/Enter/Esc navigate; Home/End jump to ends.
//   - The 🔍 icon in the panel header toggles an inline filter input.
//     The filter input never auto-focuses on open.
//   - "Other — Create new category" opens a Modal that POSTs
//     /api/categories and selects the freshly-created row.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useApi } from '../useApi';
import { api } from '../api';
import Modal from './Modal';
import Icon from './Icon';

export default function CategoryPicker({ value, onChange, id, error }) {
  const { data, refetch, error: fetchErr } = useApi('/api/categories');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1); // index in list+other
  const [filterOpen, setFilterOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [creatingErr, setCreatingErr] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const triggerRef = useRef(null);
  const panelRef = useRef(null);
  const filterRef = useRef(null);
  const filterButtonRef = useRef(null);

  const all = data?.categories || [];
  const list = useMemo(() => all.filter((c) => c.isActive !== false), [all]);

  // Filtered view. When the user has not opened the filter, `filter` is
  // empty and we return the full list — that is the show-all default.
  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((c) => c.name.toLowerCase().includes(q));
  }, [list, filter]);

  // The listbox has [categories..., "Other — Create new"]. Indexing the
  // last element gives us the sentinel without polluting the category ID
  // namespace.
  const optionCount = filtered.length + 1;
  const selectedName = value || '';
  const selectedCategory = list.find((c) => c.name === selectedName);

  const closePanel = useCallback(() => {
    setOpen(false);
    setHighlight(-1);
    setFilterOpen(false);
    setFilter('');
  }, []);

  // Outside-click closes the panel. We listen at the document level so a
  // click on the trigger itself doesn't simultaneously open + close.
  useEffect(() => {
    if (!open) return undefined;
    function onDocClick(e) {
      const t = e.target;
      if (panelRef.current?.contains(t)) return;
      if (triggerRef.current?.contains(t)) return;
      closePanel();
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open, closePanel]);

  // Keyboard navigation on the trigger (Enter / Space / ↓ opens; ↑ sets
  // highlight at last item). When the panel is open, navigation happens
  // on the panel via its own keydown handler.
  function onTriggerKeyDown(e) {
    if (open) return;
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(true);
      setHighlight(0);
    }
  }

  function onPanelKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      closePanel();
      triggerRef.current?.focus();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => (h + 1) % optionCount);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => (h <= 0 ? optionCount - 1 : h - 1));
      return;
    }
    if (e.key === 'Home') {
      e.preventDefault();
      setHighlight(0);
      return;
    }
    if (e.key === 'End') {
      e.preventDefault();
      setHighlight(optionCount - 1);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      activateHighlight();
    }
  }

  function activateHighlight() {
    if (highlight < 0 || highlight >= optionCount) return;
    if (highlight === filtered.length) {
      // "Other" row.
      setCreating(true);
      closePanel();
      return;
    }
    const c = filtered[highlight];
    onChange(c.name);
    closePanel();
    triggerRef.current?.focus();
  }

  // When the panel opens, focus the panel itself so ↑/↓ works without
  // first clicking. We do NOT focus the filter input — the show-all
  // pattern is the default and the user must opt in to filtering.
  useEffect(() => {
    if (open) panelRef.current?.focus();
  }, [open]);

  // When the user explicitly opens the filter, focus its input. When they
  // close it (icon click or Esc inside the input), drop the focus back
  // on the filter button.
  useEffect(() => {
    if (filterOpen) filterRef.current?.focus();
  }, [filterOpen]);

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

  function onFilterKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setFilterOpen(false);
      setFilter('');
      filterButtonRef.current?.focus();
    } else if (e.key === 'Enter') {
      // Enter inside the filter input shouldn't submit the form; if
      // there's exactly one visible match, pick it. Otherwise open the
      // create modal so the user can add the term they typed.
      e.preventDefault();
      if (filtered.length === 1) {
        onChange(filtered[0].name);
        closePanel();
        triggerRef.current?.focus();
      } else if (filtered.length === 0) {
        setNewName(filter.trim());
        setCreating(true);
        closePanel();
      }
    } else if (e.key === 'ArrowDown') {
      // Hand off focus to the list.
      e.preventDefault();
      panelRef.current?.focus();
      setHighlight(0);
    }
  }

  // Display string in the trigger. "Choose a category…" makes the action
  // obvious. The previous "Select a category…" read like an empty list
  // when the trigger was in its idle state.
  const triggerLabel = selectedCategory
    ? `${selectedCategory.name}${selectedCategory.productCount != null ? ` (${selectedCategory.productCount})` : ''}`
    : 'Choose a category…';

  const empty = list.length === 0;

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        onKeyDown={onTriggerKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={error ? `${id || 'cat'}-err` : undefined}
        className={`mt-1 w-full flex items-center justify-between gap-2 px-3 py-2 rounded-md border bg-white text-left ${error ? 'border-error' : 'border-outline-variant'} ${selectedCategory ? 'text-on-surface' : 'text-on-surface-variant'}`}
      >
        <span className="truncate">{triggerLabel}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} className="text-[20px] shrink-0" />
      </button>

      {open && (
        <div className="relative">
          <div
            ref={panelRef}
            role="listbox"
            aria-labelledby={id}
            onKeyDown={onPanelKeyDown}
            tabIndex={-1}
            className="absolute z-30 left-0 right-0 mt-1 bg-white border border-outline-variant rounded-md shadow-lg max-h-80 overflow-hidden flex flex-col"
          >
            {/* Header row: title on the left, search icon on the right.
                The filter input is rendered inline only when the icon
                is toggled, so the full list is visible by default. */}
            <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-outline-variant/40">
              <span className="text-label-sm text-on-surface-variant">
                {empty
                  ? 'No categories yet'
                  : `${list.length} categor${list.length === 1 ? 'y' : 'ies'}`}
              </span>
              {!empty && (
                <button
                  ref={filterButtonRef}
                  type="button"
                  onClick={() => setFilterOpen((v) => !v)}
                  className={`w-8 h-8 rounded-md flex items-center justify-center text-on-surface-variant hover:bg-surface-low ${filterOpen ? 'bg-primary/10 text-primary' : ''}`}
                  aria-label={filterOpen ? 'Hide filter' : 'Filter categories'}
                  aria-expanded={filterOpen}
                  title={filterOpen ? 'Hide filter' : 'Filter categories'}
                >
                  <Icon name="search" className="text-[18px]" />
                </button>
              )}
            </div>

            {filterOpen && !empty && (
              <div className="p-2 border-b border-outline-variant/40">
                <input
                  ref={filterRef}
                  value={filter}
                  onChange={(e) => { setFilter(e.target.value); setHighlight(0); }}
                  onKeyDown={onFilterKeyDown}
                  placeholder="Filter categories…"
                  className="w-full px-2 py-1.5 text-sm rounded border border-outline-variant/40 focus:outline-none focus:border-primary"
                  aria-label="Filter categories"
                />
              </div>
            )}

            <ul className="overflow-y-auto flex-1 py-1" role="presentation">
              {empty && (
                <li className="px-3 py-4 text-sm text-on-surface-variant">
                  No categories yet — use <span className="font-medium text-primary">Other</span> below to create your first one.
                </li>
              )}
              {!empty && filtered.length === 0 && (
                <li className="px-3 py-4 text-sm text-on-surface-variant">
                  No categories match <span className="font-medium">“{filter}”</span>. Use <span className="font-medium text-primary">Other</span> below to create it.
                </li>
              )}
              {filtered.map((c, idx) => {
                const isSelected = c.name === selectedName;
                const isHighlight = idx === highlight;
                return (
                  <li
                    key={c.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => { onChange(c.name); closePanel(); triggerRef.current?.focus(); }}
                    className={`flex items-center justify-between gap-2 px-3 py-2 text-sm cursor-pointer ${isHighlight ? 'bg-primary/10' : ''} ${isSelected ? 'font-semibold' : ''}`}
                  >
                    <span className="truncate">{c.name}</span>
                    <span className="flex items-center gap-2 shrink-0">
                      {c.productCount != null && (
                        <span className="text-xs text-on-surface-variant bg-surface-low rounded-full px-2 py-0.5">
                          {c.productCount}
                        </span>
                      )}
                      {isSelected && <Icon name="check" className="text-[18px] text-primary" />}
                    </span>
                  </li>
                );
              })}
              <li
                role="option"
                aria-selected={false}
                onMouseEnter={() => setHighlight(filtered.length)}
                onClick={() => { setCreating(true); closePanel(); }}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer border-t border-outline-variant/40 text-primary ${highlight === filtered.length ? 'bg-primary/10' : ''}`}
              >
                <Icon name="add" className="text-[18px]" />
                <span className="font-medium">Other — Create new category</span>
              </li>
            </ul>
          </div>
        </div>
      )}

      {fetchErr && !data && (
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
