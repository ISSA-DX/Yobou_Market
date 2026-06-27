import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/index.css';

// basename lets the React Router tree match the URL prefix where this app
// is served. In production each build picks the right prefix via the
// VITE_BASE_PATH env var:
//   ./                   → Capacitor Android APK (set by release-apk.yml,
//                          WebView serves the bundle from https://localhost/
//                          with no URL prefix, so basename must be empty).
//   /Yobou_Market/       → GitHub Pages customer app (default if env unset,
//                          set explicitly by deploy-web.yml).
//   /Yobou_Market/web/   → web-version (built from Web_Version_APP).
//
// In dev (vite dev) the Vite server still serves at root, so we use '/'.
// Web_Version_APP re-exports this file from its own src/, so it inherits
// the basename logic below.
const basename = import.meta.env.PROD
  ? (import.meta.env.VITE_BASE_PATH || '/').replace(/\/$/, '')
  : '/';

// Defensive: surface JS errors to the screen so a runtime failure (network,
// module load, hydration) never produces a silent blank white wall. The
// pre-JS splash in index.html stays visible as a fallback if even this
// script fails to execute.
window.addEventListener('error', (e) => {
  // eslint-disable-next-line no-console
  console.error('[yobou] window error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  // eslint-disable-next-line no-console
  console.error('[yobou] unhandled rejection:', e.reason);
});

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Tell index.html's pre-JS splash to hide itself. The selector watches
// `html[data-yobou-booted="true"]` — flipping this on the next frame
// avoids a flash where React renders behind the splash, then the splash
// vanishes.
const stuckTimer = setTimeout(() => {
  // 12s and still no mounted app — flip to the error state so the user
  // gets a real signal instead of staring at the splash forever.
  document.documentElement.setAttribute('data-yobou-stuck', 'true');
  // eslint-disable-next-line no-console
  console.error('[yobou] boot timeout — React never mounted within 12s');
}, 12000);

requestAnimationFrame(() => {
  document.documentElement.setAttribute('data-yobou-booted', 'true');
  clearTimeout(stuckTimer);
});