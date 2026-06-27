import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import KPICard from '../../components/KPICard';
import Icon from '../../components/Icon';
import { useApi, RetryError } from '../../useApi.jsx';

export default function Dashboard() {
  const kpiApi = useApi('/api/admin/kpis');
  const revApi = useApi('/api/admin/revenue-by-day');
  const ordersApi = useApi('/api/orders?limit=5');

  const kpis = kpiApi.data || { totalOrders: 0, totalRevenueCents: 0, totalVendors: 0, pendingVendors: 0, pendingChanges: 0, pendingRefunds: 0 };
  const series = revApi.data?.series || [];
  const recentOrders = ordersApi.data?.orders || [];

  const loading = kpiApi.loading && !kpiApi.data;
  const error = (kpiApi.error && !kpiApi.data) || (revApi.error && !revApi.data) || (ordersApi.error && !ordersApi.data);

  if (error) {
    return <RetryError message="Couldn't load the admin dashboard." onRetry={() => { kpiApi.refetch(); revApi.refetch(); ordersApi.refetch(); }} />;
  }
  if (loading) {
    return <div className="p-8 text-center text-on-surface-variant">Loading dashboard…</div>;
  }

  const max = Math.max(1, ...series.map((s) => s.cents));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-headline-lg font-bold">Admin Dashboard</h1>
        <div className="flex items-center gap-2 text-label-md text-on-surface-variant">
          <Icon name="calendar_today" className="text-[16px]" />
          Last 14 days
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <KPICard label="Total revenue" value={`$${(kpis.totalRevenueCents/100).toFixed(2)}`} icon="payments" />
        <KPICard label="Orders" value={kpis.totalOrders} icon="receipt_long" />
        <KPICard label="Vendors" value={kpis.totalVendors} icon="storefront" tone="tertiary" />
        <KPICard label="Vendors pending" value={kpis.pendingVendors} icon="hourglass_top" tone="secondary" />
        <KPICard label="Changes pending" value={kpis.pendingChanges} icon="pending_actions" tone="secondary" />
        <KPICard label="Refunds pending" value={kpis.pendingRefunds} icon="assignment_return" tone="secondary" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-8 gap-4">
        {/* Revenue chart */}
        <div className="lg:col-span-5 card p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Revenue</h2>
            {series.length > 1 && (() => {
              const first = series[0]?.cents || 0;
              const last = series[series.length - 1]?.cents || 0;
              const delta = first > 0 ? ((last - first) / first) * 100 : 0;
              return (
                <div className="chip">
                  <Icon name={delta >= 0 ? 'trending_up' : 'trending_down'} className={`text-[14px] ${delta >= 0 ? 'text-tertiary' : 'text-error'}`} />
                  {delta >= 0 ? '+' : ''}{delta.toFixed(1)}%
                </div>
              );
            })()}
          </div>
          <div className="h-48 flex items-end gap-2">
            {series.length === 0 ? (
              <div className="flex-1 text-center text-on-surface-variant text-sm py-12">No revenue in this period.</div>
            ) : series.map((d) => {
              const h = (d.cents / max) * 100;
              return (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <div
                    className="w-full bg-gradient-to-t from-primary to-primary-container rounded-t-md transition-all"
                    style={{ height: `${Math.max(4, h)}%` }}
                    title={`$${(d.cents/100).toFixed(2)} on ${d.date}`}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between text-label-sm text-on-surface-variant">
            <span>{series[0]?.date?.slice(5)}</span>
            <span>{series[series.length - 1]?.date?.slice(5)}</span>
          </div>
        </div>

        {/* Quick actions */}
        <div className="lg:col-span-3 card p-5">
          <h2 className="font-bold mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: 'add_box', label: 'New product', to: '/products/new' },
              { icon: 'storefront', label: 'Vendors', to: '/vendors' },
              { icon: 'receipt_long', label: 'Orders', to: '/orders' },
              { icon: 'pending_actions', label: 'Changes', to: '/changes' },
              { icon: 'assignment_return', label: 'Refunds', to: '/refunds' },
            ].map((a) => (
              <Link key={a.label} to={a.to} className="card p-4 flex flex-col items-center gap-2 hover:shadow-float">
                <Icon name={a.icon} className="text-primary text-[24px]" />
                <span className="text-label-md font-semibold">{a.label}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-5">
        <h2 className="font-bold mb-3">Recent orders</h2>
        {recentOrders.length === 0 ? (
          <div className="text-on-surface-variant text-sm py-6 text-center">No orders yet.</div>
        ) : (
          <ul className="divide-y divide-outline-variant/20">
            {recentOrders.map((o) => (
              <li key={o.id}>
                <Link to={`/orders/${o.id}/track`} className="flex items-center gap-3 py-3 hover:bg-surface-low">
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">#{o.id.slice(-8).toUpperCase()}</div>
                    <div className="text-label-md text-on-surface-variant">{(o.items || []).length} items · {new Date(o.createdAt).toLocaleString()}</div>
                  </div>
                  <div className="chip">{o.status}</div>
                  <div className="font-bold w-20 text-right">${(o.totalCents/100).toFixed(2)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}