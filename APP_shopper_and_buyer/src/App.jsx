import { lazy, Suspense, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store';

// Layouts — kept eager because they wrap nearly every route and the shell
// needs to render synchronously on first paint to avoid a layout shift
// when the lazy-loaded page mounts.
import MobileShell from './components/MobileShell.jsx';
import TransactionLayout from './components/TransactionLayout.jsx';

// Auth — eager so the splash transitions straight into the login screen
// without waiting for a network/disk fetch on cold start.
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import Logout from './pages/auth/Logout.jsx';

// Pages below are lazy-loaded: each route downloads its chunk only when
// the user navigates there. On cold start the WebView only parses the
// critical bundle + Login/Register — meaningful on mid-range Android.
const Onboarding = lazy(() => import('./pages/onboarding/Onboarding.jsx'));
const Home = lazy(() => import('./pages/home/Home.jsx'));
const Search = lazy(() => import('./pages/home/Search.jsx'));
const Help = lazy(() => import('./pages/home/Help.jsx'));
const Categories = lazy(() => import('./pages/categories/Categories.jsx'));
const CategoryDetail = lazy(() => import('./pages/categories/CategoryDetail.jsx'));
const ProductDetails = lazy(() => import('./pages/product/ProductDetails.jsx'));
const Cart = lazy(() => import('./pages/cart/Cart.jsx'));
const CheckoutShipping = lazy(() => import('./pages/checkout/CheckoutShipping.jsx'));
const CheckoutPayment = lazy(() => import('./pages/checkout/CheckoutPayment.jsx'));
const CheckoutCardNew = lazy(() => import('./pages/checkout/CheckoutCardNew.jsx'));
const CheckoutSuccess = lazy(() => import('./pages/checkout/CheckoutSuccess.jsx'));
const Orders = lazy(() => import('./pages/orders/Orders.jsx'));
const TrackOrder = lazy(() => import('./pages/orders/TrackOrder.jsx'));
const Profile = lazy(() => import('./pages/profile/Profile.jsx'));
const ProfileAddresses = lazy(() => import('./pages/profile/ProfileAddresses.jsx'));
const ProfileCards = lazy(() => import('./pages/profile/ProfileCards.jsx'));
const ProfilePreferences = lazy(() => import('./pages/profile/ProfilePreferences.jsx'));
const Notifications = lazy(() => import('./pages/Notifications.jsx'));
const GooglePicker = lazy(() => import('./pages/auth/GooglePicker.jsx'));
const AppleConfirm = lazy(() => import('./pages/auth/AppleConfirm.jsx'));

import ErrorBoundary from './components/ErrorBoundary.jsx';
import ToastHost from './components/ToastHost.jsx';

// Route-level fallback so React.Suspense has a placeholder while a lazy
// chunk downloads. Uses the same brand mark as the pre-JS splash so the
// visual transition feels continuous.
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
  const location = useLocation();
  if (!bootDone) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return children;
}

function FullPageSpinner() {
  return (
    <div className="min-h-screen flex items-center justify-center text-on-surface-variant">
      <span className="material-symbols-outlined text-4xl animate-spin">progress_activity</span>
    </div>
  );
}

export default function App() {
  return (
    <>
      <Boot />
      <ToastHost />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          {/* Public root */}
          <Route path="/" element={<Navigate to="/onboarding" replace />} />
          <Route path="/onboarding" element={<Onboarding />} />

          {/* Auth */}
          <Route path="/login" element={<TransactionLayout><Login /></TransactionLayout>} />
          <Route path="/register" element={<TransactionLayout><Register /></TransactionLayout>} />
          <Route path="/logout" element={<TransactionLayout><Logout /></TransactionLayout>} />
          <Route path="/auth/google" element={<TransactionLayout><GooglePicker /></TransactionLayout>} />
          <Route path="/auth/apple" element={<TransactionLayout><AppleConfirm /></TransactionLayout>} />

          {/* Public / customer pages */}
          <Route path="/search" element={<Search />} />
          <Route path="/help" element={<Help />} />

          {/* Customer (mobile shell) */}
          <Route element={<RequireAuth><MobileShell /></RequireAuth>}>
            <Route path="/home" element={<Home />} />
            <Route path="/categories" element={<Categories />} />
            <Route path="/categories/:slug" element={<CategoryDetail />} />
            <Route path="/product/:id" element={<ProductDetails />} />
            <Route path="/cart" element={<ErrorBoundary><Cart /></ErrorBoundary>} />
            <Route path="/orders" element={<ErrorBoundary><Orders /></ErrorBoundary>} />
            <Route path="/orders/:id/track" element={<ErrorBoundary><TrackOrder /></ErrorBoundary>} />
            <Route path="/profile" element={<ErrorBoundary><Profile /></ErrorBoundary>} />
            <Route path="/profile/addresses" element={<ErrorBoundary><ProfileAddresses /></ErrorBoundary>} />
            <Route path="/profile/cards" element={<ErrorBoundary><ProfileCards /></ErrorBoundary>} />
            <Route path="/profile/preferences" element={<ErrorBoundary><ProfilePreferences /></ErrorBoundary>} />
            <Route path="/notifications" element={<ErrorBoundary><Notifications /></ErrorBoundary>} />
          </Route>

          {/* Checkout — sticky CTA, no bottom nav */}
          <Route element={<RequireAuth><TransactionLayout /></RequireAuth>}>
            <Route path="/checkout/shipping" element={<ErrorBoundary><CheckoutShipping /></ErrorBoundary>} />
            <Route path="/checkout/payment" element={<ErrorBoundary><CheckoutPayment /></ErrorBoundary>} />
            <Route path="/checkout/card/new" element={<ErrorBoundary><CheckoutCardNew /></ErrorBoundary>} />
            <Route path="/checkout/success/:orderId" element={<ErrorBoundary><CheckoutSuccess /></ErrorBoundary>} />
          </Route>

          <Route path="*" element={<Navigate to="/home" replace />} />
        </Routes>
      </Suspense>
    </>
  );
}