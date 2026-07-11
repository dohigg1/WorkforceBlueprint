import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The web app is a pure client that consumes the NestJS API. In development
// and in preview the API runs on port 4000; we proxy the two API surfaces so
// the browser sees a single origin and the session cookie is first-party.
const proxy = {
  '/api': { target: 'http://localhost:4000', changeOrigin: true },
  '/auth': { target: 'http://localhost:4000', changeOrigin: true },
};

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy },
  preview: { port: 5173, proxy },
});
