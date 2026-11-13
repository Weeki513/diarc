/**
 * Web suggestions as you type, like the omnibox: query completions and site (navigation)
 * suggestions. One request per keystroke at most, the previous one is aborted, answers are cached.
 */
import type { Result } from './search';
import { prettyUrl } from './search';

export type SuggestProvider = 'google' | 'duckduckgo' | 'off';

const cache = new Map<string, Result[]>();
let inflight: AbortController | null = null;

function remember(key: string, value: Result[]): Result[] {
  cache.set(key, value);
  if (cache.size > 200) cache.delete(cache.keys().next().value!);
  return value;
}

export function cachedSuggestions(provider: SuggestProvider, q: string, ds = ''): Result[] | undefined {
  return cache.get(`${provider}:${ds}:${q.trim().toLowerCase()}`);
}

/** ds: Google dataset ("yt" = YouTube) for site-scoped suggestions. */
export async function webSuggestions(provider: SuggestProvider, q: string, ds = ''): Promise<Result[]> {
  const query = q.trim();
  if (provider === 'off' || !query || query.length > 120) return [];
  const key = `${provider}:${ds}:${query.toLowerCase()}`;
  const hit = cache.get(key);
  if (hit) return hit;
  inflight?.abort();
  const ctrl = (inflight = new AbortController());
  const lang = (navigator.language || 'ru').split('-')[0];
  try {
    if (provider === 'google') {
      const url = `https://suggestqueries.google.com/complete/search?client=chrome&hl=${lang}&ie=UTF-8&oe=UTF-8&q=${encodeURIComponent(query)}${ds ? `&ds=${ds}` : ''}`;
      const res = await fetch(url, { signal: ctrl.signal, credentials: 'omit' });
      const [, list = [], descs = [], , meta = {}] = (await res.json()) as [string, string[], string[], unknown, Record<string, string[]>];
      const types = meta['google:suggesttype'] ?? [];
      const out: Result[] = list.slice(0, 8).map((s, i) =>
        types[i] === 'NAVIGATION'
          ? { key: `nav:${s}`, kind: 'nav', title: descs[i] || prettyUrl(s), subtitle: prettyUrl(s), url: s, score: 0 }
          : { key: `sg:${s}`, kind: 'suggest', title: s, score: 0 },
      );
      return remember(key, out);
    }
    const res = await fetch(`https://duckduckgo.com/ac/?type=list&q=${encodeURIComponent(query)}`, { signal: ctrl.signal, credentials: 'omit' });
    const [, list = []] = (await res.json()) as [string, string[]];
    return remember(key, list.slice(0, 8).map((s) => ({ key: `sg:${s}`, kind: 'suggest', title: s, score: 0 })));
  } catch {
    return [];
  } finally {
    if (inflight === ctrl) inflight = null;
  }
}
