import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
//
// In dev, requests to `/api` are proxied to a local backend so the SPA can run
// same-origin against `wyrtloom-dashboard-api`. Set VITE_DEV_API_TARGET (e.g.
// http://127.0.0.1:7878) to enable the proxy; otherwise `/api` 404s in dev.
// In production the SPA is served same-origin with the API and no proxy is used.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const target = env.VITE_DEV_API_TARGET;
  return {
    plugins: [react()],
    server: target
      ? {
          proxy: {
            '/api': {
              target,
              changeOrigin: true,
            },
          },
        }
      : undefined,
  };
});
