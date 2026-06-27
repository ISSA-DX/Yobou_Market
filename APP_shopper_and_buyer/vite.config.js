import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` rewrites every asset URL in the built bundle so the shipped HTML
// resolves JS/CSS correctly for its hosting target:
//   - GitHub Pages (https://issa-dx.github.io/Yobou_Market/) → set
//     VITE_BASE_PATH=/Yobou_Market/ at build time.
//   - Capacitor Android APK (served from https://localhost/ by the WebView)
//     → set VITE_BASE_PATH=./ at build time so asset paths are relative
//     to the bundled index.html. (Without this, the APK renders a blank
//     white screen because the absolute /Yobou_Market/ prefix 404s inside
//     the WebView.)
// Local dev (`npm run dev`) ignores this and always serves from '/'.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || './',
  server: {
    host: true,
    port: 5173,
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
  },
});