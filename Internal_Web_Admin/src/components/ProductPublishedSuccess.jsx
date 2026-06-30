// ProductPublishedSuccess — the post-publish confirmation page.
//
// Two-step flow:
//
//   Step 1: Confirm the product is live + show the customer-facing
//   deep link so the admin can verify the storefront renders the new
//   listing.
//
//   Step 2: Optionally notify vendors. The admin picks which approved
//   vendors to ping, writes a short personal message, and we POST to
//   /api/admin/products/:id/notify-vendors. The endpoint creates one
//   inbox row per recipient + an audit row, and pushes SSE so live
//   partner pages flash a bell update.
//
// We deliberately keep Step 2 *optional*. Some publishes (Yobou
// Direct) don't have a vendor to ping; some admins prefer to skip the
// outreach entirely. The page stays open so the admin can always go
// back to the Products list without losing the deep link.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon';
import ProductPreviewCard from './ProductPreviewCard';
import { api } from '../api';
import { config, shopperProductUrl, shopperHomeUrl, partnerProductUrl, partnerProductsUrl } from '../lib/config';

const DEFAULT_MESSAGE =
  'Just published on the storefront — feel free to share with your audience. Let me know if you want to coordinate a launch promo.';

export default function ProductPublishedSuccess({ product, action }) {
  const [vendors, setVendors] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [message, setMessage] = useState(DEFAULT_MESSAGE);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [err, setErr] = useState('');

  // Pre-select the owning vendor (if any) so the admin's most likely
  // intent — "tell the vendor whose submission I just approved" — is
  // one click away. They can still broaden the selection.
  useEffect(() => {
    if (!product?.vendor?.userId) return;
    setSelected(new Set([product.vendor.userId]));
  }, [product?.vendor?.userId]);

  async function loadVendors() {
    if (vendors) return;
    try {
      const { vendors: rows } = await api('/api/admin/vendors');
      setVendors(rows);
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not load vendors.');
    }
  }

  function toggleVendor(userId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function selectAll() {
    if (!vendors) return;
    setSelected(new Set(vendors.map((v) => v.userId)));
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function sendNotifications() {
    if (selected.size === 0) {
      setErr('Pick at least one vendor.');
      return;
    }
    if (!message.trim()) {
      setErr('Write a short message first.');
      return;
    }
    setBusy(true);
    setErr('');
    try {
      const res = await api(`/api/admin/products/${product.id}/notify-vendors`, {
        method: 'POST',
        body: { vendorUserIds: Array.from(selected), message: message.trim() },
      });
      setResult(res);
      setSelected(new Set()); // clear so the admin sees the success state cleanly
    } catch (e) {
      setErr(e.data?.error || e.message || 'Could not send notifications.');
    } finally {
      setBusy(false);
    }
  }

  const customerUrl = shopperProductUrl(product.id);
  const isEdit = action === 'update';

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* ───── Step 1 — Confirmed live ───── */}
      <section aria-labelledby="success-title" className="card p-6 sm:p-8 text-center">
        <div className="mx-auto w-20 h-20 rounded-full bg-tertiary/15 flex items-center justify-center">
          <Icon name="check_circle" className="text-tertiary text-[40px]" />
        </div>
        <h1 id="success-title" className="mt-5 text-headline-lg font-bold">
          {isEdit ? 'Changes saved' : 'Product published'}
        </h1>
        <p className="mt-2 text-on-surface-variant max-w-xl mx-auto">
          <strong>{product.name}</strong> is {product.status === 'LIVE' ? 'live on the storefront' : `set to ${product.status}`}.
          Shoppers see it the next time they refresh — no deploy required.
        </p>

        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3 max-w-xl mx-auto">
          <a
            href={customerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-primary py-3"
          >
            <Icon name="open_in_new" className="text-[18px]" />
            View on customer platform
          </a>
          <a
            href={shopperHomeUrl()}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-secondary py-3"
          >
            <Icon name="storefront" className="text-[18px]" />
            Open storefront
          </a>
        </div>

        <div className="mt-6 max-w-xl mx-auto">
          <ProductPreviewCard form={product} vendorName={product.vendor?.businessName} />
        </div>

        <div className="mt-6 text-label-md text-on-surface-variant">
          Or jump back to the admin list and keep working.
        </div>
        <div className="mt-3">
          <Link to="/products" className="btn-secondary">
            <Icon name="list" className="text-[18px]" />
            All products
          </Link>
        </div>
      </section>

      {/* ───── Step 2 — Notify partners ───── */}
      <section aria-labelledby="notify-title" className="card p-5 sm:p-6">
        <div className="flex items-start gap-3 flex-col sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 id="notify-title" className="font-bold text-base flex items-center gap-2">
              <Icon name="campaign" className="text-[20px] text-primary" />
              Step 2 — Notify partners
              <span className="chip bg-secondary/20 text-secondary">Optional</span>
            </h2>
            <p className="text-on-surface-variant text-sm mt-1 max-w-2xl">
              Send a heads-up to one or more approved vendors so they can promote the new listing to their audience.
              Each recipient gets a personalised inbox message with a link to view the product.
            </p>
          </div>
          {vendors && vendors.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <button type="button" onClick={selectAll} className="text-primary hover:underline">
                Select all
              </button>
              <span className="text-on-surface-variant">·</span>
              <button type="button" onClick={clearSelection} className="text-primary hover:underline">
                Clear
              </button>
            </div>
          )}
        </div>

        {result ? (
          <div className="mt-4 card p-4 bg-tertiary/15 text-on-surface flex items-start gap-3" role="status">
            <Icon name="check_circle" className="text-tertiary text-[22px] shrink-0" />
            <div className="flex-1 text-sm">
              <div className="font-semibold">
                Sent to {result.sent} vendor{result.sent === 1 ? '' : 's'}
                {result.skipped > 0 && (
                  <span className="text-on-surface-variant font-normal"> ({result.skipped} skipped — not approved yet)</span>
                )}
                .
              </div>
              <div className="text-on-surface-variant mt-1">
                Each recipient sees the message in their inbox bell and can open it from the partner portal.
              </div>
              <div className="mt-3 flex items-center gap-2">
                <button type="button" onClick={() => setResult(null)} className="btn-secondary py-1 px-3 text-sm">
                  Send another
                </button>
                <Link to="/products" className="text-primary text-sm hover:underline">
                  Back to products
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <label className="text-label-md text-on-surface-variant">Recipients</label>
                {vendors === null ? (
                  <button type="button" onClick={loadVendors} className="btn-secondary mt-1 w-full">
                    <Icon name="group" className="text-[18px]" />
                    Load approved vendors
                  </button>
                ) : vendors.length === 0 ? (
                  <div className="mt-1 text-label-md text-on-surface-variant italic">
                    No approved vendors yet — once a vendor is approved they'll appear here.
                  </div>
                ) : (
                  <ul
                    className="mt-1 max-h-64 overflow-y-auto border border-outline-variant/30 rounded-md divide-y divide-outline-variant/20"
                    aria-label="Approved vendors"
                  >
                    {vendors.map((v) => {
                      const checked = selected.has(v.userId);
                      return (
                        <li key={v.userId}>
                          <label className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-surface-low">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleVendor(v.userId)}
                              className="shrink-0"
                            />
                            <span className="flex-1 min-w-0">
                              <span className="block font-semibold text-sm truncate">{v.businessName}</span>
                              <span className="block text-label-sm text-on-surface-variant truncate">{v.email}</span>
                            </span>
                            {product.vendor?.userId === v.userId && (
                              <span className="chip bg-secondary/20 text-secondary text-[11px]">Owner</span>
                            )}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                )}
                <div className="text-label-sm text-on-surface-variant mt-1">
                  {selected.size} selected
                </div>
              </div>

              <div>
                <label htmlFor="notify-message" className="text-label-md text-on-surface-variant">
                  Message
                </label>
                <textarea
                  id="notify-message"
                  className="input mt-1 min-h-32"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  maxLength={1000}
                />
                <div className="text-label-sm text-on-surface-variant mt-1">
                  {message.length}/1000 — sent verbatim to each vendor's inbox.
                </div>
                {product.vendor?.userId && (
                  <div className="text-label-sm text-on-surface-variant mt-2">
                    Tip: the owning vendor's deep-link is{' '}
                    <a
                      href={partnerProductUrl(product.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline break-all"
                    >
                      {partnerProductUrl(product.id)}
                    </a>
                    .
                  </div>
                )}
              </div>
            </div>

            {err && (
              <div role="alert" className="mt-3 text-error text-sm flex items-start gap-2">
                <Icon name="error" className="text-[18px] shrink-0" />
                <span>{err}</span>
              </div>
            )}

            <div className="mt-4 flex items-center justify-end gap-2">
              <a
                href={partnerProductsUrl()}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary"
              >
                <Icon name="open_in_new" className="text-[18px]" />
                View partner portal
              </a>
              <button
                type="button"
                onClick={sendNotifications}
                disabled={busy || selected.size === 0 || !message.trim()}
                className="btn-primary"
              >
                {busy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
                <Icon name="send" className="text-[18px]" />
                Send to {selected.size || 0} vendor{selected.size === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}
      </section>

      <div className="text-label-sm text-on-surface-variant text-center">
        API: <code className="px-1 bg-surface-low rounded">{config.apiBase || 'same-origin'}</code> ·
        Shopper: <code className="px-1 bg-surface-low rounded break-all">{config.shopperBase}</code>
      </div>
    </div>
  );
}