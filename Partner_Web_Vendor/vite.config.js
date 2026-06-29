import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages hosts this app at /Yobou_Market/partner/. `base` rewrites
// every asset URL in the built bundle so the deployed HTML resolves JS/CSS
// correctly under that subpath. The dev server keeps /partner/ locally.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/partner/',
  server: {
    host: true,
    port: 5176,
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
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        // Split vendor code into its own chunk so it caches independently
        // of app code across releases. React/react-router/zustand rarely
        // change; app code changes every release. Long-term this means
        // returning users re-download only the small app chunk on update.
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'state-vendor': ['zustand'],
        },
      },
    },
  },
});