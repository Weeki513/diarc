import { useEffect, useState } from 'preact/hooks';
import { DEFAULT_LAYOUT, DEFAULT_SETTINGS, K, type CacheEntry, type Settings, type Tile } from '../shared/storage';

/**
 * Everything the overlay renders comes from one chrome.storage.local snapshot,
 * read once at startup (a few ms) and kept live through storage.onChanged.
 */
export interface Snapshot {
  layout: Tile[];
  settings: Settings;
  cache: Record<string, CacheEntry>;
}

export async function loadSnapshot(): Promise<Snapshot> {
  const all = await chrome.storage.local.get(null);
  const cache: Record<string, CacheEntry> = {};
  for (const [k, v] of Object.entries(all)) if (k.startsWith('cache:')) cache[k.slice(6)] = v as CacheEntry;
  return {
    layout: (all[K.layout] as Tile[]) ?? DEFAULT_LAYOUT,
    settings: { ...DEFAULT_SETTINGS, ...(all[K.settings] ?? {}) },
    cache,
  };
}

export function useSnapshot(initial: Snapshot): Snapshot {
  const [snap, setSnap] = useState(initial);
  useEffect(() => {
    const onChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area !== 'local') return;
      setSnap((s) => {
        let next = s;
        for (const [k, c] of Object.entries(changes)) {
          if (k === K.layout) next = { ...next, layout: (c.newValue as Tile[]) ?? DEFAULT_LAYOUT };
          else if (k === K.settings) next = { ...next, settings: { ...DEFAULT_SETTINGS, ...(c.newValue ?? {}) } };
          else if (k.startsWith('cache:')) next = { ...next, cache: { ...next.cache, [k.slice(6)]: c.newValue as CacheEntry } };
        }
        return next;
      });
    };
    chrome.storage.onChanged.addListener(onChange);
    return () => chrome.storage.onChanged.removeListener(onChange);
  }, []);
  return snap;
}

/** Re-render every `ms` (for relative times like "через 5 мин"). */
export function useTick(ms = 30_000): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
  return n;
}
