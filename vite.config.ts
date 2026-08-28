import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// GitHub Pages serves a project site from /<repo>/, so the bundle has to be
// built with that prefix. Local dev and any root-domain host set BASE_PATH=/.
const base = process.env.BASE_PATH ?? '/auto-dj/';

export default defineConfig({
  base,
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: { target: 'es2022' },
  worker: { format: 'es' },
});
