import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store';

import PartnerShell from './components/PartnerShell';
import Spinner from './components/Spinner';
import ErrorBoundary from './components/ErrorBoundary';
import ToastHost from './components/ToastHost';

import Login from './pages/auth/Login';
import Logout from './pages/auth/Logout';
import Register from './pages/auth/Register';
import OnboardingPending from './pages/auth/OnboardingPending';
import Dashboard from './pages/dashboard/Dashboard';
import Products from './pages/products/Products';
import ProductNew from './pages/products/ProductNew';
import Orders from './pages/orders/Orders';
import OrderDetail from './pages/orders/OrderDetail';
import Changes from './pages/changes/Changes';
import Analytics from './pages/analytics/Analytics';
import Profile from './pages/profile/Profile';
import Notifications from './pages/notifications/Notifications';

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
  if (user.role !== 'VENDOR') {
    logout();
    return <Navigate to="/login" replace />;
  }
  return children;
}

// RequireApprovedVendor — vendors who are still PENDING go to the
// onboarding-pending page instead of the full app. REJECTED/SUSPENDED
// get bounced to the login screen.
function RequireApprovedVendor({ children }) {
  const user = useStore((s) => s.user);
  const logout = useStore((s) => s.logout);
  if (user?.vendor?.status === 'PENDING') {
    return <Navigate to="/onboarding-pending" replace />;
  }
  if (user?.vendor?.status === 'REJECTED' || user?.vendor?.status === 'SUSPENDED') {
    logout();
    return <Navigate to="/login" replace />;
  }
  return children;
}

export default function App() {
  return (
    <ErrorBoundary>
      <Boot />
      <ToastHost />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/logout" element={<Logout />} />
        <Route path="/onboarding-pending" element={<RequireAuth><OnboardingPending /></RequireAuth>} />
        <Route element={<RequireAuth><RequireApprovedVendor><PartnerShell /></RequireApprovedVendor></RequireAuth>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/products" element={<Products />} />
          <Route path="/products/new" element={<ProductNew />} />
          <Route path="/products/:id/edit" element={<ProductNew />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/orders/:id/track" element={<OrderDetail />} />
          <Route path="/changes" element={<Changes />} />
          <Route path="/analytics" element={<Analytics />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/notifications" element={<Notifications />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}