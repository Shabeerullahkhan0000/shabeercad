import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  resolve: {
    alias: {
      '@x-viewer/core': 'https://cdn.jsdelivr.net/npm/@x-viewer/core@latest/dist/index.esm.js',
      '@x-viewer/plugins': 'https://cdn.jsdelivr.net/npm/@x-viewer/plugins@latest/dist/index.esm.js',
      '@x-viewer/ui': 'https://cdn.jsdelivr.net/npm/@x-viewer/ui@latest/dist/index.esm.js',
    }
  },
  build: {
    rollupOptions: {
      external: [
        '@x-viewer/core',
        '@x-viewer/plugins',
        '@x-viewer/ui'
      ],
      input: {
        main: 'index.html',
        dwg0: 'dwg_0.html',
        dwg1: 'dwg_1.html',
        dwg2: 'dwg_2.html',
        dxf0: 'dxf_0.html',
        dxf1: 'dxf_1.html',
        dxf2: 'dxf_2.html',
        compare1: 'dxf_compare_1_viewport.html',
        compare2: 'dxf_compare_2_viewports.html',
        cadCompare: 'cad_compare_2_files.html',
        pdf1: 'pdf_1.html',
        dwgjson: 'dwg_json_viewer.html'
      }
    }
  }
});
