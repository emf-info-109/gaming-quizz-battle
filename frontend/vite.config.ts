/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * En développement, Vite relaie /api, /health et /ready vers Express (port 3000).
 * Le frontend utilise TOUJOURS des URL relatives (/api/...) : en production,
 * c'est Nginx qui joue ce rôle de relais, derrière HAProxy.
 */
const backend = process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: backend, changeOrigin: false },
      '/health': { target: backend },
      '/ready': { target: backend },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    include: ['test/**/*.test.{ts,tsx}'],
    setupFiles: ['test/setup.ts'],
  },
});
