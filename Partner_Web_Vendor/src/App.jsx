import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store';

import PartnerShell from './components/PartnerShell';
import Spinner from './components/Spinner';
import ErrorBoundary from './components/ErrorBoundary';
import ToastHost from './components/ToastHost';

// Auth — eager so the splash transitions straight into the login screen
// without waiting for a network/disk fetch on cold start.
import Login from './pages/auth/Login';
import Logout from './pages/auth/Logout';
import Register from './pages/auth/Register';

// Pages below are lazy-loaded: each route downloads its chunk only when
// the user navigates there. On cold start the WebView only parses the
// critical bundle + Login/Register — meaningful on mid-range Android.
const OnboardingPending = lazy(() => import('./pages/auth/OnboardingPending'));
const Dashboard = lazy(() => import('./pages/dashboard/Dashboard'));
const Products = lazy(() => import('./pages/products/Products'));
const ProductNew = lazy(() => import('./pages/products/ProductNew'));
const Orders = lazy(() => import('./pages/orders/Orders'));
const OrderDetail = lazy(() => import('./pages/orders/OrderDetail'));
const Changes = lazy(() => import('./pages/changes/Changes'));
const Analytics = lazy(() => import('./pages/analytics/Analytics'));
const Profile = lazy(() => import('./pages/profile/Profile'));
const Notifications = lazy(() => import('./pages/notifications/Notifications'));

// Route-level fallback for React.Suspense — shown briefly while a lazy
// chunk downloads.
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
    </div>
  );
}

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
      <Suspense fallback={<RouteFallback />}>
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
      </Suspense>
    </ErrorBoundary>
  );
}