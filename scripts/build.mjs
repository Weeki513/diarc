// Builds the extension into dist/. Usage: node scripts/build.mjs [--watch]
import { build } from 'vite';

const watch = process.argv.includes('--watch') ? {} : null;
await build({ configFile: 'vite.config.ts', build: { watch } });
await build({ configFile: 'vite.content.config.ts', build: { watch } });
if (!watch) console.log('\n✓ Built to dist/. Load it via dia://extensions → "Load unpacked".');
