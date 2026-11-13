// Scaffold a creature: npm run new-creature -- my-creature "Имя"
import { existsSync, writeFileSync } from 'node:fs';

const [id, name = id] = process.argv.slice(2);
if (!id || !/^[a-z][a-z0-9-]*$/.test(id)) {
  console.error('Usage: npm run new-creature -- <kebab-id> ["Имя"]');
  process.exit(1);
}
const file = `src/ambient/creatures/${id}.ts`;
if (existsSync(file)) {
  console.error(`${file} already exists`);
  process.exit(1);
}
writeFileSync(
  file,
  `/** ${name}: describe it in one line. */
import { defineCreature, fromAscii } from '../api';

// Facing right. '.' = empty, 1–4 = palette shade (1 darkest), other characters are drawn as text.
const A = fromAscii([
  '...11....',
  '..1222...',
  '1122334o.',
  '..1222...',
  '...11....',
]);
const B = fromAscii([
  '.........',
  '..11122..',
  '1122334o.',
  '..11122..',
  '.........',
]);

export default defineCreature({
  id: '${id}',
  name: '${name}',
  palette: ['#203040', '#3b6a8a', '#6fb3d6', '#e6f6ff'],
  frames: [A, B],
  fps: 3,
  speed: 0.5,
  turn: 0.02,
  trailChars: '·~',
  trailColor: 2,
});
`,
);
console.log(`Created ${file}. Run npm run build and pick "${name}" in Настройки → Существа.`);
