// VariantsAccordion — identical implementation across admin and partner apps.
// See Internal_Web_Admin/src/components/VariantsAccordion.jsx for design notes.
import { useEffect, useState } from 'react';
import VariantsEditor from './VariantsEditor';
import Icon from './Icon';

export default function VariantsAccordion({ form, update, errors = {} }) {
  const count = Array.isArray(form.variants) ? form.variants.length : 0;
  // Open by default when the product already has variants — the typical
  // edit-mode case. New products start collapsed so the small Stock
  // field above stays visually quiet.
  const [open, setOpen] = useState(count > 0);

  // Auto-expand when the form has variant errors. Without this the user
  // sees the top-level "Some variant rows need attention" alert but the
  // offending rows stay hidden inside the collapsed panel.
  useEffect(() => {
    if (errors && (errors.variants || (Array.isArray(errors.rows) && errors.rows.some(Boolean)))) {
      setOpen(true);
    }
  }, [errors]);

  return (
    <section
      aria-labelledby="pf-variants-accordion"
      className="rounded-md border border-outline-variant/40 bg-white"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="pf-variants-panel"
        className="w-full flex items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2">
          <Icon
            name={open ? 'expand_more' : 'chevron_right'}
            className="text-[20px] text-on-surface-variant"
          />
          <span className="font-semibold text-sm">Variants</span>
          <span className="text-label-sm text-on-surface-variant font-normal">(optional)</span>
        </span>
        <span
          className={`text-label-sm rounded-full px-2 py-0.5 ${
            count > 0 ? 'bg-primary/10 text-primary' : 'bg-surface-low text-on-surface-variant'
          }`}
          aria-label={`${count} variant${count === 1 ? '' : 's'} added`}
        >
          {count} added
        </span>
      </button>

      {open && (
        <div id="pf-variants-panel" className="px-3 pb-3 pt-1 border-t border-outline-variant/30">
          <VariantsEditor form={form} update={update} errors={errors} />
        </div>
      )}
    </section>
  );
}
