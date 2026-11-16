
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],

  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    css: false,
  },

  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:5000',
    },
  },

  build: {
    sourcemap: false,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'vendor',
              test: /node_modules\/(react|react-dom|react-router-dom)\//,
            },
            {
              name: 'data',
              test: /node_modules\/(@tanstack|@reduxjs|react-redux|axios)\//,
            },
            {
              name: 'motion',
              test: /node_modules\/framer-motion\//,
            },
            {
              name: 'forms',
              test: /node_modules\/(react-hook-form|@hookform|zod)\//,
            },
          ],
        },
      },
    },
  },
});
