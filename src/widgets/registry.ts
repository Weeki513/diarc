/**
 * Auto-registration: every src/widgets/<id>/index.tsx with a default export
 * `defineWidget({...})` is picked up at build time. No list to maintain.
 */
import type { WidgetDefinition } from '../shared/widget';

const modules = import.meta.glob<{ default: WidgetDefinition }>('./*/index.tsx', { eager: true });

export const widgets = new Map<string, WidgetDefinition>();
for (const [path, mod] of Object.entries(modules)) {
  const def = mod.default;
  const folder = path.split('/')[1];
  if (!def?.id) {
    console.warn(`[diarc] ${path} has no default defineWidget() export`);
    continue;
  }
  if (def.id !== folder) console.warn(`[diarc] widget id "${def.id}" should match its folder "${folder}"`);
  widgets.set(def.id, def);
}
