/**
 * Auto-registration: every src/ambient/creatures/<id>.ts with a default export
 * `defineCreature({...})` is picked up at build time. No list to maintain.
 */
import type { CreatureDefinition } from './api';

const modules = import.meta.glob<{ default: CreatureDefinition }>('./creatures/*.ts', { eager: true });

export const creatures = new Map<string, CreatureDefinition>();
for (const [path, mod] of Object.entries(modules)) {
  const def = mod.default;
  const file = path.split('/').pop()!.replace(/\.ts$/, '');
  if (!def?.id || !def.frames?.length) {
    console.warn(`[diarc] ${path} has no default defineCreature() export`);
    continue;
  }
  if (def.id !== file) console.warn(`[diarc] creature id "${def.id}" should match its file "${file}"`);
  creatures.set(def.id, def);
}

/** Built-ins first, in a fixed order; custom creatures after them. */
const ORDER = ['manta', 'fireflies', 'swallows', 'turtles', 'leaves'];
export const creatureIds = (): string[] => [...creatures.keys()].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99));
