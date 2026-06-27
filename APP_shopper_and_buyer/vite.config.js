import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages hosts this app at /Yobou_Market/. Setting `base` here makes
// Vite rewrite every asset URL in the built bundle to that subpath, so the
// shipped HTML resolves JS/CSS correctly when served from
// https://issa-dx.github.io/Yobou_Market/. The dev server still uses '/'
// locally — set via --base flag at the command line if needed for local
// preview.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/Yobou_Market/',
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