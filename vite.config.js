import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      external: [/^@x-viewer/],
    },
  },
  optimizeDeps: {
    exclude: ['@x-viewer/core', '@x-viewer/plugins', '@x-viewer/ui'],
  },
  server: {
    port: 3000,
    host: '0.0.0.0',
  }
});
