import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store';

import AdminShell from './components/AdminShell';
import ErrorBoundary from './components/ErrorBoundary';
import Spinner from './components/Spinner';

import Login from './pages/auth/Login';
import Logout from './pages/auth/Logout';
import Dashboard from './pages/dashboard/Dashboard';
import Products from './pages/products/Products';
import ProductNew from './pages/products/ProductNew';
import Vendors from './pages/vendors/Vendors';
import VendorNew from './pages/vendors/VendorNew';
import Orders from './pages/orders/Orders';
import OrderDetail from './pages/orders/OrderDetail';
import Changes from './pages/changes/Changes';
import Refunds from './pages/refunds/Refunds';
import Users from './pages/users/Users';
import Broadcast from './pages/broadcast/Broadcast';
import AuditLog from './pages/audit/AuditLog';
import NotificationPrefs from './pages/preferences/Notifications';
import Appearance from './pages/preferences/Appearance';

function Boot() {
  const boot = useStore((s) => s.boot);
  useEffect(() => { boot(); }, [boot]);
  return null;
}

function RequireAuth({ children }) {
  const user = useStore((s) => s.user);
  const bootDone = useStore((s) => s.bootDone);
  const logout = useStore((s) => s.logout);
  const location = useLocation();
  if (!bootDone) return <Spinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  if (user.role !== 'ADMIN') {
    // Wrong role for this portal — sign out and bounce to login.
    logout();
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <>
      <Boot />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/logout" element={<Logout />} />
        <Route element={<RequireAuth><AdminShell /></RequireAuth>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<ErrorBoundary><Products /></ErrorBoundary>} />
          <Route path="/products/new" element={<ErrorBoundary><ProductNew /></ErrorBoundary>} />
          <Route path="/products/:id/edit" element={<ErrorBoundary><ProductNew /></ErrorBoundary>} />
          <Route path="/vendors" element={<ErrorBoundary><Vendors /></ErrorBoundary>} />
          <Route path="/vendors/new" element={<ErrorBoundary><VendorNew /></ErrorBoundary>} />
          <Route path="/orders" element={<ErrorBoundary><Orders /></ErrorBoundary>} />
          <Route path="/orders/:id/track" element={<ErrorBoundary><OrderDetail /></ErrorBoundary>} />
          <Route path="/changes" element={<ErrorBoundary><Changes /></ErrorBoundary>} />
          <Route path="/refunds" element={<ErrorBoundary><Refunds /></ErrorBoundary>} />
          <Route path="/users" element={<ErrorBoundary><Users /></ErrorBoundary>} />
          <Route path="/broadcast" element={<ErrorBoundary><Broadcast /></ErrorBoundary>} />
          <Route path="/audit" element={<ErrorBoundary><AuditLog /></ErrorBoundary>} />
          <Route path="/preferences/notifications" element={<ErrorBoundary><NotificationPrefs /></ErrorBoundary>} />
          <Route path="/preferences/appearance" element={<ErrorBoundary><Appearance /></ErrorBoundary>} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}