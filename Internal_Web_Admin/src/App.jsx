import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useStore } from './store';

import AdminShell from './components/AdminShell';
import Spinner from './components/Spinner';

import Login from './pages/auth/Login';
import Logout from './pages/auth/Logout';
import Dashboard from './pages/dashboard/Dashboard';
import Products from './pages/products/Products';
import ProductNew from './pages/products/ProductNew';
import Vendors from './pages/vendors/Vendors';
import VendorNew from './pages/vendors/VendorNew';
import Orders from './pages/orders/Orders';
import Changes from './pages/changes/Changes';
import Refunds from './pages/refunds/Refunds';

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
          <Route path="/products" element={<Products />} />
          <Route path="/products/new" element={<ProductNew />} />
          <Route path="/products/:id/edit" element={<ProductNew />} />
          <Route path="/vendors" element={<Vendors />} />
          <Route path="/vendors/new" element={<VendorNew />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/changes" element={<Changes />} />
          <Route path="/refunds" element={<Refunds />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </>
  );
}