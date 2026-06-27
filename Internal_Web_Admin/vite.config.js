import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages hosts this app at /Yobou_Market/admin/. `base` rewrites
// every asset URL in the built bundle so the deployed HTML resolves JS/CSS
// correctly under that subpath. The dev server keeps /admin/ locally.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/admin/',
  server: {
    host: true,
    port: 5174,
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