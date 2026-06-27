import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store';

// Layouts
import MobileShell from './components/MobileShell.jsx';
import TransactionLayout from './components/TransactionLayout.jsx';

// Auth
import Login from './pages/auth/Login.jsx';
import Register from './pages/auth/Register.jsx';
import Logout from './pages/auth/Logout.jsx';
import GooglePicker from './pages/auth/GooglePicker.jsx';
import AppleConfirm from './pages/auth/AppleConfirm.jsx';

// Customer
import Onboarding from './pages/onboarding/Onboarding.jsx';
import Home from './pages/home/Home.jsx';
import Search from './pages/home/Search.jsx';
import Help from './pages/home/Help.jsx';
import Categories from './pages/categories/Categories.jsx';
import CategoryDetail from './pages/categories/CategoryDetail.jsx';
import ProductDetails from './pages/product/ProductDetails.jsx';
import Cart from './pages/cart/Cart.jsx';
import CheckoutShipping from './pages/checkout/CheckoutShipping.jsx';
import CheckoutPayment from './pages/checkout/CheckoutPayment.jsx';
import CheckoutCardNew from './pages/checkout/CheckoutCardNew.jsx';
import CheckoutSuccess from './pages/checkout/CheckoutSuccess.jsx';
import Orders from './pages/orders/Orders.jsx';
import TrackOrder from './pages/orders/TrackOrder.jsx';
import Profile from './pages/profile/Profile.jsx';
import ProfileAddresses from './pages/profile/ProfileAddresses.jsx';
import ProfileCards from './pages/profile/ProfileCards.jsx';
import ProfilePreferences from './pages/profile/ProfilePreferences.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

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
      <Routes>
        {/* Public root — go to onboarding for first visit, otherwise home */}
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
    </>
  );
}