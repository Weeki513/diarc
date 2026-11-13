import type { Engine } from './engines';
import type { TileSize } from './widget';

export interface Tile {
  /** Instance id (unique per tile). */
  id: string;
  widget: string;
  size: TileSize;
  config: Record<string, any>;
}

export interface CacheEntry<D = unknown> {
  data?: D;
  updatedAt?: number;
  error?: string;
  needsAuth?: string;
  fetching?: boolean;
}

export interface Settings {
  googleClientId: string;
  tickTickClientId: string;
  tickTickClientSecret: string;
  /** Load the overlay in the active tab ahead of time for instant first open. */
  prewarm: boolean;
  /** Enter opens results in a new tab (Arc behaviour). Shift+Enter does the opposite. */
  openInNewTab: boolean;
  theme: 'system' | 'light' | 'dark';
  /** liquid: refracting glass (SVG lens filter); frost: plain blur; off: solid panels. */
  glass: 'liquid' | 'frost' | 'off';
  /** Web search suggestions while typing (the query is sent to the provider, like the omnibox). */
  suggest: 'google' | 'duckduckgo' | 'off';
  /** Your own Tab-to-search sites. */
  engines: Engine[];
  glassTune: GlassTune;
  ambient: AmbientSettings;
}

/** Liquid glass tuning (Настройки → Жидкое стекло). */
export interface GlassTune {
  /** Frost under the glass, px (Gaussian stdDeviation). */
  blur: number;
  /** Lens strength, 0 = flat glass. */
  refraction: number;
  /** Width of the bent rim, px. */
  bezel: number;
  /** Chromatic split between R/G/B, 0–0.6. */
  chroma: number;
  saturation: number;
  /** Tint opacity over the page, 0–0.95. */
  tint: number;
  /** Rim light strength, 0–1.5. */
  rim: number;
  /** Radius of the light that follows the cursor, px. */
  light: number;
  /** Soft blur of the page around the bar, px. */
  haze: number;
}

export const DEFAULT_GLASS_TUNE: GlassTune = { blur: 1.1, refraction: 1, bezel: 34, chroma: 0.32, saturation: 1.45, tint: 0.55, rim: 1, light: 260, haze: 2.5 };

/** Ambient ASCII creatures (Настройки → Существа). */
/** A creature id from src/ambient/creatures (or 'mix'). */
export type Species = string;
export interface AmbientSettings {
  /** On sites: off, only behind the open bar, or always floating over pages. */
  show: 'off' | 'bar' | 'always';
  species: Species;
  count: number;
  speed: number;
  /** Cell size in px (the size of one "pixel" of a creature). */
  cell: number;
  /** Trail length in frames, 0 = no trail. */
  trail: number;
  /** Characters used for trails; empty = the species' own. */
  chars: string;
  /** '' = natural colours, otherwise one hex colour the palette is built from. */
  color: string;
  opacity: number;
  grid: boolean;
  /** How creatures react to the cursor. */
  cursor: 'flee' | 'follow' | 'none';
  fps: 15 | 30 | 60;
  /** Where on the page they live. */
  area: 'full' | 'bottom' | 'edges';
  /** Sites where they never appear (host names). */
  exclude: string[];
}

export const DEFAULT_AMBIENT: AmbientSettings = {
  show: 'bar', species: 'manta', count: 10, speed: 0.8, cell: 9, trail: 22, chars: '', color: '', opacity: 0.6,
  grid: true, cursor: 'flee', fps: 30, area: 'full', exclude: [],
};

export const DEFAULT_SETTINGS: Settings = {
  googleClientId: import.meta.env.VITE_GOOGLE_CLIENT_ID ?? '',
  tickTickClientId: import.meta.env.VITE_TICKTICK_CLIENT_ID ?? '',
  tickTickClientSecret: import.meta.env.VITE_TICKTICK_CLIENT_SECRET ?? '',
  prewarm: true,
  openInNewTab: true,
  theme: 'system',
  glass: 'liquid',
  suggest: 'google',
  engines: [],
  glassTune: DEFAULT_GLASS_TUNE,
  ambient: DEFAULT_AMBIENT,
};

export const DEFAULT_LAYOUT: Tile[] = [
  { id: 'calendar-1', widget: 'calendar', size: 'L', config: {} },
  { id: 'ticktick-1', widget: 'ticktick', size: 'L', config: {} },
  { id: 'gmail-1', widget: 'gmail', size: 'XL', config: {} },
];

export const K = {
  settings: 'settings',
  layout: 'layout',
  cache: (id: string) => `cache:${id}`,
  store: (id: string) => `store:${id}`,
  auth: (p: string) => `auth:${p}`,
};

export async function getSettings(): Promise<Settings> {
  const r = await chrome.storage.local.get(K.settings);
  const saved = (r[K.settings] ?? {}) as Partial<Settings>;
  const merged = { ...DEFAULT_SETTINGS, ...saved };
  // Empty saved values fall back to build-time defaults.
  for (const k of ['googleClientId', 'tickTickClientId', 'tickTickClientSecret'] as const) {
    if (!merged[k]) merged[k] = DEFAULT_SETTINGS[k];
  }
  return merged;
}

export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const r = await chrome.storage.local.get(K.settings);
  await chrome.storage.local.set({ [K.settings]: { ...(r[K.settings] ?? {}), ...patch } });
}

export async function getLayout(): Promise<Tile[]> {
  const r = await chrome.storage.local.get(K.layout);
  return (r[K.layout] as Tile[] | undefined) ?? DEFAULT_LAYOUT;
}

export async function saveLayout(layout: Tile[]): Promise<void> {
  await chrome.storage.local.set({ [K.layout]: layout });
}
