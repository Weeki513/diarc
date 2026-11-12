// Builds a Web Store package: diarc.zip without the dev "key" (the store assigns its own ID).
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, cpSync } from 'node:fs';

execSync('node scripts/build.mjs', { stdio: 'inherit' });
rmSync('.store', { recursive: true, force: true });
cpSync('dist', '.store', { recursive: true });
const m = JSON.parse(readFileSync('.store/manifest.json', 'utf8'));
delete m.key;
writeFileSync('.store/manifest.json', JSON.stringify(m, null, 2));
rmSync('diarc.zip', { force: true });
execSync('cd .store && zip -qr ../diarc.zip .');
rmSync('.store', { recursive: true });
console.log('✓ diarc.zip ready for the Chrome Web Store');
