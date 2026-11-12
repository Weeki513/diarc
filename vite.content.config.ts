import { defineConfig } from 'vite';
import { resolve } from 'node:path';

// Content script: tiny, dependency-free IIFE. All UI lives in an extension iframe.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: false,
    target: 'chrome120',
    lib: {
      entry: resolve(__dirname, 'src/content/index.ts'),
      formats: ['iife'],
      name: 'diarcContent',
      fileName: () => 'content.js',
    },
  },
});
