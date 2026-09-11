import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// In dev (`npm run dev` in web/), API calls are proxied to the Express server
// from `npm run dev:web`. In production the same server serves web/dist itself.
// Ports come from the root .env (GUI_PORT for this dev server, PORT for the
// proxy target) so multiple clones of the repo can run side by side.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, fileURLToPath(new URL('..', import.meta.url)), '');
  return {
    plugins: [react()],
    build: {
      rollupOptions: {
        // Three documents: the dashboard SPA, the monday.com custom-object
        // iframe (served by Express at /monday-object) and the Google Picker
        // popup (/google-picker.html, served by express.static).
        input: {
          main: fileURLToPath(new URL('index.html', import.meta.url)),
          'monday-object': fileURLToPath(new URL('monday-object.html', import.meta.url)),
          'google-picker': fileURLToPath(new URL('google-picker.html', import.meta.url)),
        },
      },
    },
    server: {
      port: Number(env.GUI_PORT) || 5173,
      proxy: {
        '/api': `http://localhost:${env.PORT || 3000}`,
      },
    },
  };
});
