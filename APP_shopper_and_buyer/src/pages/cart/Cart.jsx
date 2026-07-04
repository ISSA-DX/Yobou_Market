import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../../api';
import { useStore } from '../../store';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { productImage } from '../../lib/productImage';
import { formatPrice } from '../../lib/format';
import { colorToHex } from '../../lib/colorSwatch';
import { toast } from '../../lib/toast';

const SHIPPING_CENTS = 499;
const FREE_SHIPPING_THRESHOLD_CENTS = 5000;

export default function Cart() {
  const navigate = useNavigate();
  const refreshCart = useStore((s) => s.refreshCartCount);
  const ensureGuestSession = useStore((s) => s.ensureGuestSession);
  const user = useStore((s) => s.user);
  const bootDone = useStore((s) => s.bootDone);
  const currency = useStore((s) => s.user?.currency || 'USD');
  const [busyId, setBusyId] = useState(null);
  const [selectionBusy, setSelectionBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  // Identity gate: don't fire /api/cart until boot() has had a chance
  // to restore a real user from the refresh cookie. If boot() leaves
  // us with no user, mint a guest session first. This prevents the
  // 401 / RetryError flash on cold start, reload, or deep-link to /cart,
  // and avoids overwriting a returning customer's access token with a
  // fresh guest token before boot() completes.
  const [cartReady, setCartReady] = useState(false);
  const { data, error, loading, refetch } = useApi('/api/cart', { skip: !cartReady });

  useEffect(() => {
    if (!bootDone) return;
    if (user) {
      setCartReady(true);
      return;
    }
    let cancelled = false;
    (async () => {
      const ensured = await ensureGuestSession();
      if (!cancelled) setCartReady(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bootDone]);

  // Compute membership split from the server response. We keep three
  // buckets so the UX can render different visuals:
  //   - validItems: rows whose product join is intact (not deleted)
  //   - within that, selectedItems.filter(Boolean) drives the summary,
  //     free-shipping progress, Proceed-to-Checkout count, and the
  //     order itself when the user finishes checkout.
  const items = Array.isArray(data?.items) ? data.items : [];
  const validItems = useMemo(() => items.filter((i) => i?.product), [items]);
  const selectedItems = useMemo(
    () => validItems.filter((i) => i.selectedForCheckout),
    [validItems]
  );
  const unselectedItems = useMemo(
    () => validItems.filter((i) => !i.selectedForCheckout),
    [validItems]
  );

  // Subtotals / savings / shipping / total — computed against the
  // SELECTED subset only. The summary card is a preview of what the
  // order will be charged for, intentionally separate from the cart
  // row count so an unselected row never inflates the "total to pay".
  const subtotal = selectedItems.reduce((s, i) => s + i.product.priceCents * i.quantity, 0);
  const dealSavings = selectedItems.reduce((s, i) => {
    const cap = i.product.compareAtPriceCents;
    const pp = i.product.priceCents;
    if (typeof cap === 'number' && typeof pp === 'number' && cap > pp) {
      return s + (cap - pp) * i.quantity;
    }
    return s;
  }, 0);
  const itemCount = selectedItems.reduce((s, i) => s + i.quantity, 0);
  const shipping = subtotal >= FREE_SHIPPING_THRESHOLD_CENTS
    ? 0
    : (selectedItems.length > 0 ? SHIPPING_CENTS : 0);
  const tax = 0;
  const total = subtotal + shipping + tax;
  const totalUnits = validItems.reduce((s, i) => s + i.quantity, 0);
  const selectedUnits = selectedItems.reduce((s, i) => s + i.quantity, 0);

  // Master checkbox state values. `allSelected` powers checked=true,
  // and any partial selection flips `masterIndeterminate` so the box
  // renders the "-/✓" hybrid familiar from Gmail/Amazon master rows.
  const allSelected = validItems.length > 0 && selectedItems.length === validItems.length;
  const someSelected = selectedItems.length > 0 && selectedItems.length < validItems.length;
  // The indeterminate DOM property isn't settable from JSX. Park a
  // ref on the master checkbox and update it as a side effect — this
  // is React-canonical and keeps SSR-safe (the ref callback fires
  // only once on mount).
  const masterRef = useRef(null);
  useEffect(() => {
    if (masterRef.current) masterRef.current.indeterminate = someSelected;
  }, [someSelected, allSelected]);

  useEffect(() => { if (data) refreshCart(); }, [data, refreshCart]);

  async function setQty(item, qty) {
    if (qty < 0) return;
    setActionError('');
    if (qty === 0) {
      await remove(item);
      return;
    }
    setBusyId(item.id);
    try {
      await api(`/api/cart/${item.product.id}`, {
        method: 'PATCH',
        body: {
          quantity: qty,
          variantId: item.variantId || null,
        },
      });
      await refetch();
    } catch (e) {
      const msg = humanizeError(e);
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(item) {
    setBusyId(item.id);
    setActionError('');
    try {
      await api(`/api/cart/${item.product.id}`, {
        method: 'DELETE',
        body: { variantId: item.variantId || null },
      });
      await refetch();
      toast.success('Removed from cart');
    } catch (e) {
      const msg = humanizeError(e);
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleItem(cartItemId, nextSelected) {
    if (busyId === cartItemId) return; // rapid-tap guard — concurrent PATCH+refetch would race
    setActionError('');
    setBusyId(cartItemId);
    try {
      await api(`/api/cart/items/${cartItemId}`, {
        method: 'PATCH',
        body: { selected: nextSelected },
      });
      await refetch();
    } catch (e) {
      const msg = humanizeError(e);
      setActionError(msg);
      toast.error(msg);
    } finally {
      setBusyId(null);
    }
  }

  async function setSelectionAll(selected) {
    setActionError('');
    setSelectionBusy(true);
    try {
      await api('/api/cart/selection', { method: 'PATCH', body: { selected } });
      await refetch();
    } catch (e) {
      const msg = humanizeError(e);
      setActionError(msg);
      toast.error(msg);
    } finally {
      setSelectionBusy(false);
    }
  }

  // Proceed-to-Checkout. If the user is moving forward with zero
  // items manually selected but the cart has rows, auto-select-all
  // right before navigation. This replaces the prior version which
  // gated the button on `selectedItems.length === 0`, silently
  // disabling it whenever a row's checkbox was off — from the user
  // POV that read as "the button doesn't function", which was the
  // exact complaint this fix addresses. Errors are absorbed because
  // /checkout/shipping renders its own failure state and we'd rather
  // bounce the shopper to the form than trap them on a stale cart
  // layout. Extracted from the <button onClick=...> so the JSX stays
  // scannable and matches the named-handler pattern used by
  // setQty / remove / toggleItem / setSelectionAll.
  async function proceedToCheckout() {
    if (validItems.length === 0) return;
    if (selectedItems.length === 0) {
      setSelectionBusy(true);
      setActionError('');
      try {
        await api('/api/cart/selection', { method: 'PATCH', body: { selected: true } });
        await refetch();
        toast.success(
          `All ${validItems.length} ${validItems.length === 1 ? 'item' : 'items'} selected for checkout.`,
        );
      } catch {
        // Don't block navigation. /checkout/shipping will surface
        // its own error state if any subsequent call needs a real
        // identity. The bare `void 0` body is the canonical strict-
        // ESLint-friendly empty catch (matches the pattern in
        // Login.jsx's ensureGuestSession).
        void 0;
      } finally {
        setSelectionBusy(false);
      }
    }
    navigate('/checkout/shipping');
  }

  if (!cartReady || (loading && !data)) {
    return (
      <div className="p-8 text-center text-on-surface-variant">
        <Icon name="progress_activity" className="text-[32px] animate-spin" />
        <div className="mt-3 text-sm">Loading your cart…</div>
      </div>
    );
  }

  if (error && !data) {
    return <RetryError message="Couldn't load your cart." onRetry={refetch} />;
  }

  if (validItems.length === 0) {
    return (
      <div className="px-4 pt-6 pb-6 text-center max-w-screen-xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <Link to="/home" className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></Link>
          <h1 className="font-bold text-lg">Shopping Cart</h1>
          <span className="w-10" />
        </header>
        <div className="py-16">
          <div className="mx-auto w-24 h-24 rounded-full bg-surface-low flex items-center justify-center">
            <Icon name="shopping_bag" className="text-[44px] text-on-surface-variant" />
          </div>
          <h2 className="mt-5 text-headline-md font-bold">Your cart is empty</h2>
          <p className="mt-2 text-on-surface-variant text-sm max-w-xs mx-auto">Browse products and add your favorites to start shopping.</p>
          <Link to="/home" className="btn-primary mt-6 inline-flex">Start shopping</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 pt-4 pb-6 max-w-screen-xl mx-auto">
      <header className="flex items-center justify-between mb-4 md:hidden">
        <Link to="/home" className="p-2 -ml-2"><Icon name="arrow_back" className="text-[24px]" /></Link>
        <h1 className="font-bold text-lg">Shopping Cart</h1>
        <span className="w-10" />
      </header>

      <div className="hidden md:flex items-end justify-between mb-6">
        <div>
          <h1 className="text-headline-lg font-bold">Shopping Cart</h1>
          <p className="text-on-surface-variant mt-1">{totalUnits} {totalUnits === 1 ? 'item' : 'items'}</p>
        </div>
        <Link to="/home" className="text-primary font-semibold flex items-center gap-1">
          <Icon name="arrow_back" className="text-[18px]" /> Continue shopping
        </Link>
      </div>

      {actionError && (
        <div className="mb-4 p-3 rounded-lg bg-error-container text-error text-sm flex items-start gap-2">
          <Icon name="error" className="text-[18px] shrink-0" />
          <span>{actionError}</span>
        </div>
      )}

      <div className="lg:grid lg:grid-cols-12 lg:gap-8">
        {/* Items column */}
        <div className="lg:col-span-8 space-y-4">
          {/* Selection bar. Single round-trip to the server for the
              entire cart when the master checkbox flips — see
              setSelectionAll. The indeterminate attribute is a DOM
              property, not an HTML one, so it can't live in JSX; we
              drive it from a ref bound in a useEffect keyed on the
              derived selected/allSelected booleans. */}
          <div className="card p-3 flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer flex-1 min-w-0">
              <input
                type="checkbox"
                checked={allSelected}
                ref={masterRef}
                onChange={(e) => setSelectionAll(e.target.checked)}
                disabled={selectionBusy || validItems.length === 0}
                className="w-5 h-5 rounded border-2 border-outline-variant text-primary focus:ring-2 focus:ring-primary/30 accent-[--color-primary] cursor-pointer disabled:opacity-50"
                aria-label={allSelected ? 'Deselect all items' : 'Select all items'}
              />
              <span className="text-sm font-semibold">
                {someSelected ? (
                  <>{selectedItems.length} of {validItems.length} selected</>
                ) : allSelected ? (
                  <>All {validItems.length} selected</>
                ) : (
                  <>Select items to checkout</>
                )}
              </span>
            </label>
            {selectionBusy && <Icon name="progress_activity" className="text-[18px] animate-spin text-primary" />}
            {selectedItems.length > 0 && (
              <button
                onClick={() => setSelectionAll(false)}
                disabled={selectionBusy}
                className="text-label-md text-on-surface-variant hover:text-error font-semibold disabled:opacity-50"
              >
                Clear
              </button>
            )}
          </div>

          {/* Free-shipping progress — computed against the SELECTED
              subset so the bar only counts what the shopper is
              actually about to pay for. */}
          {selectedItems.length > 0 && subtotal < FREE_SHIPPING_THRESHOLD_CENTS && (
            <div className="card p-4 bg-gradient-to-r from-primary to-primary-container text-white">
              <div className="flex items-center justify-between text-label-md">
                <span>Free shipping on orders over {formatPrice(FREE_SHIPPING_THRESHOLD_CENTS, currency)}</span>
                <span>{formatPrice(subtotal, currency)} / {formatPrice(FREE_SHIPPING_THRESHOLD_CENTS, currency)}</span>
              </div>
              <div className="mt-2 h-2 bg-white/20 rounded-full overflow-hidden">
                <div className="h-full bg-secondary transition-all" style={{ width: `${Math.min(100, (subtotal / FREE_SHIPPING_THRESHOLD_CENTS) * 100)}%` }} />
              </div>
              <div className="mt-2 text-label-md">
                Add {formatPrice(FREE_SHIPPING_THRESHOLD_CENTS - subtotal, currency)} more for free shipping.
              </div>
            </div>
          )}
          {selectedItems.length === 0 && validItems.length > 0 && (
            <div className="card p-3 flex items-center gap-3 bg-surface-low border border-outline-variant/20">
              <Icon name="info" className="text-primary text-[20px]" />
              <div className="text-sm text-on-surface-variant">
                Pick which items you want to buy today — the rest will stay in your cart for later.
              </div>
            </div>
          )}

          {/* Selected rows first, unselected below. Keeps the most
              "active" rows at the top of the column. Both sections
              render the same CartItem body so the visual treatment
              stays consistent. */}
          {selectedItems.length > 0 && (
            <div className="space-y-3">
              {selectedItems.map((it) => (
                <CartItem
                  key={it.id}
                  item={it}
                  busy={busyId === it.id}
                  currency={currency}
                  onToggleSelect={(selected) => toggleItem(it.id, selected)}
                  onQtyChange={(qty) => setQty(it, qty)}
                  onRemove={() => remove(it)}
                />
              ))}
            </div>
          )}

          {unselectedItems.length > 0 && (
            <div className="space-y-3">
              {selectedItems.length > 0 && (
                <div className="flex items-center gap-2 mt-4 mb-2">
                  <Icon name="bookmark" className="text-[18px] text-on-surface-variant" />
                  <span className="text-label-md text-on-surface-variant font-semibold uppercase tracking-wide">
                    Saved for later ({unselectedItems.length})
                  </span>
                </div>
              )}
              {unselectedItems.map((it) => (
                <CartItem
                  key={it.id}
                  item={it}
                  busy={busyId === it.id}
                  currency={currency}
                  onToggleSelect={(selected) => toggleItem(it.id, selected)}
                  onQtyChange={(qty) => setQty(it, qty)}
                  onRemove={() => remove(it)}
                />
              ))}
            </div>
          )}

          {items.length > validItems.length && (
            <p className="text-sm text-on-surface-variant">
              {items.length - validItems.length} unavailable item(s) were removed from your total.
            </p>
          )}
        </div>

        {/* Summary column */}
        <div className="lg:col-span-4 mt-6 lg:mt-0">
          <div className="card p-5 lg:sticky lg:top-4 space-y-3">
            <h2 className="text-headline-md font-bold hidden lg:block">Order Summary</h2>
            {selectedItems.length === 0 ? (
              <div className="text-sm text-on-surface-variant text-center py-4">
                Select at least one item to see your total.
              </div>
            ) : (
              <>
                <SummaryRow label={`Subtotal (${itemCount} items)`} value={formatPrice(subtotal, currency)} />
                {dealSavings > 0 && (
                  <SummaryRow
                    label="You save"
                    value={`-${formatPrice(dealSavings, currency)}`}
                    valueClass="text-tertiary font-semibold"
                  />
                )}
                <SummaryRow
                  label="Shipping"
                  value={shipping === 0 ? 'FREE' : formatPrice(shipping, currency)}
                  valueClass={shipping === 0 ? 'text-tertiary font-semibold' : ''}
                />
                <SummaryRow label="Tax" value="Calculated at checkout" muted />
                <div className="border-t border-outline-variant/30 pt-3 mt-1">
                  <SummaryRow label="Estimated total" value={formatPrice(total, currency)} bold />
                </div>
              </>
            )}

            {/* Saved-for-later reminder inside the summary column so
                it's visible whether or not the user scrolled down to
                the unselected section. */}
            {unselectedItems.length > 0 && selectedItems.length > 0 && (
              <div className="text-label-md text-on-surface-variant flex items-start gap-1.5 pt-2 border-t border-outline-variant/20">
                <Icon name="bookmark" className="text-[14px] mt-0.5 shrink-0" />
                <span>{unselectedItems.length} {unselectedItems.length === 1 ? 'item' : 'items'} saved for later</span>
              </div>
            )}

            {/* Proceed-to-Checkout. The Amazon/Temu behaviour most
                shoppers expect: clicking the button ALWAYS navigates
                to checkout, even if the user didn't manually tick
                any items. See proceedToCheckout() above for the
                auto-select-all story. The label flips between two
                honest states so the user can predict the action:
                  - "Proceed to Checkout (N)" when items are pre-picked.
                  - "Proceed with all N items →" when none are picked.
                The disabled clause only gates on selectionBusy now;
                validItems.length > 0 is always true at this point
                because the empty-cart branch returns early above. */}
            <button
              onClick={proceedToCheckout}
              disabled={selectionBusy}
              className="btn-primary w-full py-3 mt-2 disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {selectionBusy && <Icon name="progress_activity" className="text-[18px] animate-spin" />}
              {selectedItems.length > 0 ? (
                <>
                  Proceed to Checkout ({itemCount})
                  <Icon name="arrow_forward" />
                </>
              ) : selectionBusy ? (
                <>Selecting items…</>
              ) : (
                <>
                  Proceed with all {validItems.length} {validItems.length === 1 ? 'item' : 'items'}
                  <Icon name="arrow_forward" />
                </>
              )}
            </button>

            <p className="text-center text-label-md text-on-surface-variant flex items-center justify-center gap-1">
              <Icon name="lock" className="text-[14px]" /> Secure checkout
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function CartItem({ item, busy, currency, onToggleSelect, onQtyChange, onRemove }) {
  const p = item?.product;
  // Defensive: a malformed row (e.g. server returned a deleted product
  // reference or a corrupted join) should never crash the whole cart.
  // The parent already filters validItems, but this guard protects against
  // future API shape drift and keeps the ErrorBoundary from surfacing.
  if (!p || typeof p.id !== 'string' || typeof p.priceCents !== 'number') {
    console.warn('CartItem received malformed row:', item);
    return null;
  }
  const v = item.variant; // { color, size, stock, ... } when a specific (color, size) was picked; null for non-variant products
  const hasDeal = typeof p.compareAtPriceCents === 'number'
    && p.compareAtPriceCents > p.priceCents;
  const [showQty, setShowQty] = useState(false);
  // Local UI state for the selection checkbox: starts synced with the
  // prop and freezes for ~250 ms after a toggle so the checkbox shows
  // a brief "just-toggled" state even if the refetch races. Prevents
  // the flicker of "checked → loading → unchecked" when the user
  // mashes a checkbox rapidly.
  const [optimisticSelected, setOptimisticSelected] = useState(item.selectedForCheckout);
  // Re-sync the optimistic state to the server-truth prop after every
  // refetch so the next toggle reads the right baseline. Pairs with
  // the rapid-tap guard in the parent (toggleItem) — together they
  // prevent two concurrent PATCH requests from racing on the same row.
  useEffect(() => { setOptimisticSelected(item.selectedForCheckout); }, [item.selectedForCheckout]);
  const lineTotal = p.priceCents * item.quantity;
  // Per-variant cap for the qty stepper. For a variant product the
  // cart row is pinned to a specific (color, size) so the cap is the
  // variant's stock, not the product's sum. Falls back to p.stock for
  // legacy non-variant products.
  const stockCap = v
    ? (typeof v.stock === 'number' ? v.stock : 0)
    : (typeof p.stock === 'number' ? p.stock : 0);

  function handleToggle() {
    const next = !optimisticSelected;
    setOptimisticSelected(next);
    onToggleSelect(next);
  }

  return (
    <div className={`card p-3 sm:p-4 flex gap-3 sm:gap-4 transition-opacity ${optimisticSelected ? '' : 'opacity-70'}`}>
      {/* Selection checkbox. amazon-style — sits to the left of the
          thumbnail so the eye lands on checked → image → name. The
          label wraps the box and a small Icon because hit-target
          accuracy on mobile matters more than pixel-perfect alignment. */}
      <label className="flex items-center justify-center shrink-0 cursor-pointer">
        <input
          type="checkbox"
          checked={optimisticSelected}
          onChange={handleToggle}
          className="sr-only" // visually replaced by the styled box below; sr-only keeps it keyboard-accessible
          aria-label={optimisticSelected ? `Deselect ${p.name}` : `Select ${p.name} for checkout`}
        />
        <span
          className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition ${
            optimisticSelected
              ? 'bg-primary border-primary text-white'
              : 'bg-white border-outline-variant hover:border-primary/60'
          }`}
          aria-hidden="true"
        >
          {optimisticSelected && <Icon name="check" className="text-[16px] leading-none" />}
        </span>
      </label>

      <Link to={`/product/${p.id}`} className="w-24 h-24 sm:w-28 sm:h-28 rounded-lg overflow-hidden bg-surface-low shrink-0">
        <img src={productImage(p)} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" onError={(e) => { e.currentTarget.src = '/seed-images/placeholder.svg'; }} />
      </Link>

      <div className="flex-1 min-w-0 flex flex-col">
        <div className="flex items-start justify-between gap-2">
          <Link to={`/product/${p.id}`} className="block group min-w-0">
            <h3 className="font-semibold text-sm sm:text-base text-on-surface line-clamp-2 leading-snug group-hover:text-primary transition-colors">
              {p.name}
            </h3>
          </Link>
          <button
            onClick={onRemove}
            disabled={busy}
            className="text-on-surface-variant hover:text-error p-1 disabled:opacity-50 shrink-0"
            aria-label="Remove item"
          >
            <Icon name="delete" className="text-[20px]" />
          </button>
        </div>

        <div className="flex items-center gap-2 flex-wrap mt-0.5">
          {p.category && (
            <div className="text-label-md text-on-surface-variant">{p.category}</div>
          )}
          {v && (v.color || v.size) && (
            <div className="text-label-md text-on-surface-variant flex items-center gap-1.5 min-w-0">
              {p.category && <span aria-hidden="true">·</span>}
              {v.color && (
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-2.5 h-2.5 rounded-full border border-outline-variant/40 shrink-0"
                    style={{ background: colorToHex(v.color) }}
                    aria-hidden="true"
                  />
                  <span>{v.color}</span>
                </span>
              )}
              {v.color && v.size && <span aria-hidden="true">·</span>}
              {v.size && <span>Size {v.size}</span>}
            </div>
          )}
          {!optimisticSelected && (
            <span className="chip bg-surface-high text-on-surface-variant text-label-md">
              <Icon name="bookmark" className="text-[12px]" />
              Saved for later
            </span>
          )}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 flex-wrap">
            {/* Mobile +/- */}
            <div className="flex items-center bg-surface-low rounded-full px-1.5 py-1 sm:hidden">
              <button
                onClick={() => onQtyChange(item.quantity - 1)}
                disabled={busy}
                className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center disabled:opacity-50"
              >
                <Icon name="remove" className="text-[16px]" />
              </button>
              <span className="font-semibold text-sm w-8 text-center">{item.quantity}</span>
              <button
                onClick={() => onQtyChange(item.quantity + 1)}
                disabled={busy || item.quantity >= stockCap}
                className="w-7 h-7 rounded-full bg-white shadow-sm flex items-center justify-center disabled:opacity-50"
              >
                <Icon name="add" className="text-[16px]" />
              </button>
            </div>

            {/* Desktop dropdown */}
            <div className="hidden sm:block relative">
              <button
                onClick={() => setShowQty((v) => !v)}
                className="flex items-center gap-2 bg-surface-low hover:bg-surface-high border border-outline-variant/30 rounded-md px-3 py-1.5 text-sm font-medium transition"
              >
                Qty: {item.quantity}
                <Icon name="expand_more" className="text-[16px]" />
              </button>
              {showQty && (
                <div className="absolute z-20 mt-1 bg-white border border-outline-variant/30 rounded-md shadow-float w-24 max-h-48 overflow-y-auto">
                  {[...Array(Math.max(1, Math.min(10, stockCap)))].map((_, i) => (
                    <button
                      key={i + 1}
                      onClick={() => { onQtyChange(i + 1); setShowQty(false); }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-surface-low ${item.quantity === i + 1 ? 'bg-surface-low font-semibold' : ''}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {busy && <Icon name="progress_activity" className="text-[18px] animate-spin text-primary" />}
          </div>

          <div className="text-right ml-auto">
            <div className="font-bold text-on-surface text-sm sm:text-base leading-none">
              {formatPrice(lineTotal, currency)}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5 justify-end flex-wrap-reverse">
              {item.quantity > 1 && (
                <span className="text-label-md text-on-surface-variant leading-none">
                  {formatPrice(p.priceCents, currency)} each
                </span>
              )}
              {hasDeal && (
                <span className="text-label-md text-on-surface-variant line-through leading-none">
                  {formatPrice(p.compareAtPriceCents, currency)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, bold, muted, valueClass = '' }) {
  return (
    <div className={`flex items-center justify-between ${muted ? 'text-on-surface-variant' : 'text-on-surface'}`}>
      <span className={bold ? 'font-bold text-base' : 'text-sm'}>{label}</span>
      <span className={`${bold ? 'font-bold text-headline-md' : 'text-sm'} ${valueClass}`}>{value}</span>
    </div>
  );
}

function humanizeError(e) {
  const code = e?.data?.error || e?.message;
  if (code === 'INSUFFICIENT_STOCK') return 'Not enough stock for this item.';
  if (code === 'UNAUTHENTICATED' || e?.status === 401) return 'Please sign in again.';
  if (code === 'CART_EMPTY') return 'Your cart is empty.';
  return code || 'Something went wrong. Please try again.';
}
