import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `base` matches the GitHub Pages path (https://<user>.github.io/nexa-crm/).
export default defineConfig({
  base: process.env.VITE_BASE ?? '/nexa-crm/',
  plugins: [react()],
  server: { port: 5173 },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 900,
  },
});
