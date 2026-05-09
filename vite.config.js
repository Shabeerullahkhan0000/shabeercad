import { defineConfig } from 'vite';
import { resolve } from 'path';

const cdnViewerAliases = {
  resolve: {
    alias: {
      '@x-viewer/core': 'https://cdn.jsdelivr.net/npm/@x-viewer/core@latest/dist/index.esm.js',
      '@x-viewer/plugins': 'https://cdn.jsdelivr.net/npm/@x-viewer/plugins@latest/dist/index.esm.js',
      '@x-viewer/ui': 'https://cdn.jsdelivr.net/npm/@x-viewer/ui@latest/dist/index.esm.js',
    },
  },
};

export default defineConfig(({ command }) => ({
  ...(command === 'serve' ? cdnViewerAliases : {}),
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
}));
