import { useState } from 'react';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { useStore } from '../../store';
import { formatPrice } from '../../lib/format';
import { productImage } from '../../lib/productImage';

const RANGES = [
  { v: 7, label: '7d' },
  { v: 14, label: '14d' },
  { v: 30, label: '30d' },
  { v: 90, label: '90d' },
];

export default function Analytics() {
  const user = useStore((s) => s.user);
  const currency = user?.currency || 'USD';
  const [days, setDays] = useState(30);
  const { data, error, loading, refetch } = useApi(`/api/vendor/analytics?days=${days}`);

  if (error && !data) {
    return <RetryError message="Couldn't load analytics." onRetry={refetch} />;
  }

  const series = data?.revenueByDay || [];
  const top = data?.topProducts || [];
  const k = data?.kpis || {};
  const max = Math.max(1, ...series.map((s) => s.cents));

  const totalCents = series.reduce((a, b) => a + (b.cents || 0), 0);
  const totalOrders = series.reduce((a, b) => a + (b.orders || 0), 0);
  const bestDay = series.reduce((a, b) => (b.cents > (a?.cents || 0) ? b : a), null);
  const aov = totalOrders > 0 ? totalCents / totalOrders : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-headline-lg font-bold">Analytics</h1>
          <p className="text-on-surface-variant text-sm">Revenue, top products, and key metrics.</p>
        </div>
        <div className="flex items-center gap-1">
          {RANGES.map((r) => (
            <button
              key={r.v}
              onClick={() => setDays(r.v)}
              className={`px-3 py-1.5 rounded-full text-label-md ${
                days === r.v ? 'bg-primary text-white' : 'bg-surface-low text-on-surface-variant hover:bg-surface-high'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {loading && !data && (
        <div className="card p-8 text-center text-on-surface-variant">
          <Icon name="progress_activity" className="text-[24px] animate-spin inline-block" />
          <span className="ml-2">Loading analytics…</span>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="card p-5">
              <div className="text-label-md text-on-surface-variant">Best day</div>
              <div className="mt-1 font-bold text-2xl">
                {bestDay ? formatPrice(bestDay.cents, currency) : '—'}
              </div>
              <div className="text-label-md text-on-surface-variant">{bestDay?.date || '—'}</div>
            </div>
            <div className="card p-5">
              <div className="text-label-md text-on-surface-variant">Average order value</div>
              <div className="mt-1 font-bold text-2xl">{formatPrice(Math.round(aov), currency)}</div>
              <div className="text-label-md text-on-surface-variant">over {totalOrders} orders</div>
            </div>
            <div className="card p-5">
              <div className="text-label-md text-on-surface-variant">Pending changes</div>
              <div className="mt-1 font-bold text-2xl">{k.pendingChanges ?? 0}</div>
              <div className="text-label-md text-on-surface-variant">awaiting admin review</div>
            </div>
          </div>

          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold">Revenue</h2>
              <div className="chip">Last {days} days</div>
            </div>
            <div className="h-56 flex items-end gap-1">
              {series.length === 0 ? (
                <div className="flex-1 text-center text-on-surface-variant text-sm py-12">No revenue in this range.</div>
              ) : series.map((d) => {
                const h = (d.cents / max) * 100;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 min-w-0">
                    <div
                      className="w-full bg-gradient-to-t from-primary to-primary-container rounded-t-md transition-all"
                      style={{ height: `${Math.max(4, h)}%` }}
                      title={`${formatPrice(d.cents, currency)} on ${d.date}`}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex justify-between text-label-sm text-on-surface-variant">
              <span>{series[0]?.date?.slice(5) || '—'}</span>
              <span>{series[series.length - 1]?.date?.slice(5) || '—'}</span>
            </div>
          </div>

          <div className="card p-5">
            <h2 className="font-bold mb-3">Top products</h2>
            {top.length === 0 ? (
              <div className="text-on-surface-variant text-sm py-6 text-center">No product sales yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-label-md text-on-surface-variant">
                    <tr>
                      <th className="px-3 py-2">Product</th>
                      <th className="px-3 py-2 text-right">Units sold</th>
                      <th className="px-3 py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {top.map((p) => (
                      <tr key={p.productId} className="border-t border-outline-variant/20">
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-3 min-w-0">
                            <img
                              src={productImage(p)}
                              alt=""
                              className="w-10 h-10 rounded-md object-cover bg-surface-low shrink-0"
                              onError={(e) => { e.currentTarget.src = `${import.meta.env.BASE_URL}seed-images/placeholder.svg`; }}
                            />
                            <div className="min-w-0">
                              <div className="font-semibold line-clamp-1">{p.name}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right">{p.unitsSold || 0}</td>
                        <td className="px-3 py-2 text-right font-semibold">{formatPrice(p.revenueCents || 0, currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}