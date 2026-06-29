import { Link } from 'react-router-dom';
import KPICard from '../../components/KPICard';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';
import { useStore } from '../../store';
import { formatPrice } from '../../lib/format';

export default function Dashboard() {
  const user = useStore((s) => s.user);
  const analyticsApi = useApi('/api/vendor/analytics?days=14');
  const ordersApi = useApi('/api/orders/vendor/mine?limit=5');

  const kpis = analyticsApi.data?.kpis || {};
  const series = analyticsApi.data?.revenueByDay || [];
  const topProducts = analyticsApi.data?.topProducts || [];
  const recentOrders = ordersApi.data?.orders || [];

  const loading = analyticsApi.loading && !analyticsApi.data;
  const error = (analyticsApi.error && !analyticsApi.data);

  if (error) {
    return <RetryError message="Couldn't load your dashboard." onRetry={() => { analyticsApi.refetch(); ordersApi.refetch(); }} />;
  }
  if (loading) {
    return <div className="p-8 text-center text-on-surface-variant">Loading dashboard…</div>;
  }

  const max = Math.max(1, ...series.map((s) => s.cents));
  const currency = user?.currency || 'USD';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-headline-lg font-bold">
            Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''} 👋
          </h1>
          <p className="text-on-surface-variant text-sm">{user?.vendor?.businessName || 'Your store'} · last 14 days</p>
        </div>
        <Link to="/products/new" className="btn-primary">
          <Icon name="add" /> Add product
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard label="Products" value={kpis.products ?? 0} icon="inventory_2" />
        <KPICard label="Live" value={kpis.live ?? 0} icon="visibility" tone="tertiary" />
        <KPICard label="Pending changes" value={kpis.pendingChanges ?? 0} icon="pending_actions" tone="secondary" />
        <KPICard label="Today orders" value={kpis.todayOrders ?? 0} icon="receipt_long" tone="secondary" />
        <KPICard label="Open orders" value={kpis.openOrders ?? 0} icon="inbox" />
        <KPICard label="This month" value={formatPrice(kpis.monthRevenueCents || 0, currency)} icon="payments" tone="tertiary" />
        <KPICard label="This week" value={formatPrice(kpis.weekRevenueCents || 0, currency)} icon="savings" />
        <KPICard label="Conversion" value={`${(kpis.conversionRate ?? 0).toFixed?.(1) || kpis.conversionRate || 0}%`} icon="trending_up" tone="secondary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue chart */}
        <div className="lg:col-span-2 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Revenue</h2>
            <div className="chip">
              <Icon name="calendar_today" className="text-[14px]" />
              Last 14 days
            </div>
          </div>
          <div className="h-48 flex items-end gap-1.5">
            {series.length === 0 ? (
              <div className="flex-1 text-center text-on-surface-variant text-sm py-12">No revenue yet — start selling!</div>
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

        {/* Quick actions */}
        <div className="card p-5">
          <h2 className="font-bold mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: 'add_box', label: 'New product', to: '/products/new' },
              { icon: 'receipt_long', label: 'Orders', to: '/orders' },
              { icon: 'pending_actions', label: 'Changes', to: '/changes' },
              { icon: 'monitoring', label: 'Analytics', to: '/analytics' },
            ].map((a) => (
              <Link key={a.label} to={a.to} className="card p-4 flex flex-col items-center gap-2 hover:shadow-float">
                <Icon name={a.icon} className="text-primary text-[24px]" />
                <span className="text-label-md font-semibold text-center">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {topProducts.length > 0 && (
        <div className="card p-5">
          <h2 className="font-bold mb-3">Top products</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {topProducts.slice(0, 5).map((p) => (
              <div key={p.productId} className="card p-3 flex flex-col gap-1">
                <div className="text-label-sm text-on-surface-variant truncate">{p.name}</div>
                <div className="font-bold text-sm">{p.unitsSold || 0} sold</div>
                <div className="text-label-sm text-on-surface-variant">{formatPrice(p.revenueCents || 0, currency)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold">Recent orders</h2>
          <Link to="/orders" className="text-label-md text-primary hover:underline">See all</Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="text-on-surface-variant text-sm py-6 text-center">No orders yet.</div>
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {recentOrders.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}/track`} className="flex items-center gap-3 py-3 hover:bg-surface-low">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">#{o.id.slice(-8).toUpperCase()}</div>
                    <div className="text-label-md text-on-surface-variant">
                      {(o.items || []).length} items · {new Date(o.createdAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="chip">{o.status}</div>
                  <div className="font-bold w-24 text-right">{formatPrice(o.totalCents, currency)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}