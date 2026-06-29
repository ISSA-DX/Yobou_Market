import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/index.css';

// basename lets the React Router tree match the URL prefix where this app
// is served. In production each build picks the right prefix via the
// VITE_BASE_PATH env var:
//   ./                   → Capacitor Android APK (set by release-partner-apk.yml,
//                          WebView serves the bundle from https://localhost/
//                          with no URL prefix, so basename is just '/').
//   /Yobou_Market/partner/  → GitHub Pages production build (set by
//                            deploy-web.yml).
//   /partner/            → dev (Vite serves the partner SPA at that path).
//
// React Router's basename must start with '/' (or be undefined) — a bare
// '.' or empty string silently breaks route matching and renders nothing
// to the DOM. So when Vite's `base` is './' (APK) we translate it to '/'
// here instead of letting `.replace(/\/$/, '')` collapse it to '.'.
//
// In dev (vite dev) the Vite server still serves at root, so we use '/'.
const rawBasePath = import.meta.env.VITE_BASE_PATH;
const basename = (() => {
  if (!import.meta.env.PROD) return '/';
  if (!rawBasePath || rawBasePath === './' || rawBasePath === '.') return '/';
  return rawBasePath.replace(/\/$/, '');
})();

// Defensive: surface JS errors to the screen so a runtime failure (network,
// module load, hydration) never produces a silent blank white wall. The
// pre-JS splash in index.html stays visible as a fallback if even this
// script fails to execute.
window.addEventListener('error', (e) => {
  // eslint-disable-next-line no-console
  console.error('[yobou-partner] window error:', e.error || e.message);
});
window.addEventListener('unhandledrejection', (e) => {
  // eslint-disable-next-line no-console
  console.error('[yobou-partner] unhandled rejection:', e.reason);
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
  console.error('[yobou-partner] boot timeout — React never mounted within 12s');
}, 12000);

requestAnimationFrame(() => {
  document.documentElement.setAttribute('data-yobou-booted', 'true');
  clearTimeout(stuckTimer);
});