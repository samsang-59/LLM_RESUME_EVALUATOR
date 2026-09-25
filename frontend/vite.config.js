import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the browser talks to Vite on :5173 and Vite forwards every /api
// call to the backend on :4000 - so the browser sees one origin and the backend
// needs no CORS setup. VITE_API_URL overrides this for a deployed backend.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './tests/setup.js',
    css: false,
  },
});
