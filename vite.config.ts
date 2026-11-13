import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

// Main build: extension pages (overlay, options) + background service worker.
// The content script is built separately as a single IIFE (see vite.content.config.ts),
// because content scripts cannot use ES module imports.
export default defineConfig({
  root: 'src/pages',
  publicDir: resolve(__dirname, 'public'),
  plugins: [preact()],
  envDir: resolve(__dirname),
  build: {
    outDir: resolve(__dirname, 'dist'),
    emptyOutDir: true,
    target: 'chrome120',
    modulePreload: { polyfill: false },
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      input: {
        overlay: resolve(__dirname, 'src/pages/overlay.html'),
        options: resolve(__dirname, 'src/pages/options.html'),
        ambient: resolve(__dirname, 'src/pages/ambient.html'),
        background: resolve(__dirname, 'src/background/index.ts'),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === 'background' ? 'background.js' : 'assets/[name].js'),
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});
