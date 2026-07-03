import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In dev (`npm run dev` in web/), API calls are proxied to the Express server
// from `npm run dev:web`. In production the same server serves web/dist itself.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
