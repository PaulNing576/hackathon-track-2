import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Dev: Vite serves the SPA on :3000 and proxies /api/* to the Express dev
// server on :3001, which serves data endpoints and proxies /api/mgai/* to
// the official API on :8000.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: { outDir: 'dist/client' },
});
