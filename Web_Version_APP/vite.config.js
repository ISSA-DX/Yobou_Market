// Web_Version_APP — browser-only build of the shopper app.
//
// This project shares source with APP_shopper_and_buyer/ (the Capacitor /
// Android APK source) so we never have two copies of the React tree to
// maintain. The Vite alias below rewrites every "src/..." import to point
// at the sibling folder's source tree at build/dev time.
//
// The only files that live in this folder are:
//   - package.json (its own dev deps — no Capacitor here)
//   - vite.config.js (this file)
//   - tailwind.config.js + postcss.config.js (so the build pipeline is
//     independently runnable without borrowing from APP_shopper_and_buyer)
//   - index.html
//
// When the operator wants the web build to come from this folder instead
// of APP_shopper_and_buyer/dist, run `npm run build` here and the server
// will pick it up automatically.

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const shopperSrc = path.resolve(__dirname, '../APP_shopper_and_buyer/src');

export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  resolve: {
    alias: {
      // Rewrite every "src/..." and "@/..." module import to the shared source tree.
      // The entry script (`Web_Version_APP/src/main.jsx`) lives in this folder and
      // re-exports the shopper app's bootstrap; everything else resolves through
      // this alias.
      src: shopperSrc,
      '@': shopperSrc,
    },
  },
  server: {
    host: true,
    port: 5175,
    proxy: {
      '/api': {
        target: process.env.VITE_API_BASE || 'http://localhost:4000',
        changeOrigin: true,
      },
      '/uploads': {
        target: process.env.VITE_API_BASE || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
