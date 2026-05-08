import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
      },
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
