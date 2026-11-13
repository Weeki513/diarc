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
}

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
