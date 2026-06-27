import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/index.css';

// basename lets the React Router tree match the URL prefix where this app
// is served. In production each build picks the right prefix via the
// VITE_BASE_PATH env var:
//   /Yobou_Market/      → customer app (default for APP_shopper_and_buyer)
//   /Yobou_Market/web/  → web-version (when built from Web_Version_APP)
//
// In dev (vite dev) the Vite server still serves at root, so we use '/'.
// Web_Version_APP re-exports this file from its own src/, so it inherits
// the basename logic below.
const basename = import.meta.env.PROD
  ? (import.meta.env.VITE_BASE_PATH || '/Yobou_Market').replace(/\/$/, '')
  : '/';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);