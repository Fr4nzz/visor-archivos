import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  // For GitHub Pages - set to repo name
  base: '/Dropbox_inv/',

  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },

  build: {
    // Optimize for large data handling
    target: 'esnext',

    // Web Worker handling
    rollupOptions: {
      output: {
        manualChunks: {
          d3: ['d3'],
          'react-vendor': ['react', 'react-dom'],
        },
      },
    },
  },

  // Web Worker configuration
  worker: {
    format: 'es',
  },
});
