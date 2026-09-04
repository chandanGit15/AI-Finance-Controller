import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Bind to all interfaces so the v0 Preview proxy can reach the dev server.
    // Previously this defaulted to 127.0.0.1 (localhost only), so the Preview
    // could not reach Vite and fell back to the Express backend on :3001,
    // which returned "Cannot GET /" because no production build existed.
    host: true,
    port: 5173,
    // Allow the Preview's proxy hostname to connect to the dev server.
    allowedHosts: true,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
})
