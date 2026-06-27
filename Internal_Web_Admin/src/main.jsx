import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import './styles/index.css';

// basename lets the React Router tree match the URL prefix where this app
// is served:
//   /Yobou_Market/admin  → production (GitHub Pages)
//   /admin                → dev (Vite serves the admin SPA at that path)
//
// The basename is intentionally hard-coded rather than env-driven because
// the admin app is always built standalone and the path is known.
const basename = import.meta.env.PROD ? '/Yobou_Market/admin' : '/admin';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);