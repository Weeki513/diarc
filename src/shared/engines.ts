/**
 * Site search for Tab-to-search (Arc-style): type "youtube", press Tab, type the query, Enter
 * opens YouTube's results. Built-ins below, custom engines from settings, and engines discovered
 * automatically from OpenSearch descriptions of sites you visit (stored under `engines:auto`).
 */
export interface Engine {
  name: string;
  /** Exact word that selects it ("yt"); the name and host also match by prefix. */
  keyword: string;
  /** Results page, %s = the query. */
  url: string;
  host?: string;
  aliases?: string[];
  /** Google suggest dataset (yt = YouTube) for better suggestions. */
  ds?: string;
  source?: 'builtin' | 'custom' | 'auto';
}

const lang = typeof navigator !== 'undefined' ? (navigator.language || 'ru').split('-')[0] : 'ru';

export const BUILTIN_ENGINES: Engine[] = [
  { name: 'YouTube', keyword: 'yt', host: 'youtube.com', url: 'https://www.youtube.com/results?search_query=%s', aliases: ['ютуб'], ds: 'yt' },
  { name: 'Google', keyword: 'g', host: 'google.com', url: 'https://www.google.com/search?q=%s', aliases: ['гугл'] },
  { name: 'Google Maps', keyword: 'maps', host: 'maps.google.com', url: 'https://www.google.com/maps/search/%s', aliases: ['карты'] },
  { name: 'Google Images', keyword: 'img', url: 'https://www.google.com/search?tbm=isch&q=%s', aliases: ['картинки'] },
  { name: 'Google Translate', keyword: 'tr', host: 'translate.google.com', url: `https://translate.google.com/?sl=auto&tl=${lang}&text=%s`, aliases: ['translate', 'переводчик'] },
  { name: 'Gmail', keyword: 'gm', host: 'mail.google.com', url: 'https://mail.google.com/mail/u/0/#search/%s', aliases: ['почта'] },
  { name: 'Google Drive', keyword: 'drive', host: 'drive.google.com', url: 'https://drive.google.com/drive/search?q=%s', aliases: ['диск'] },
  { name: 'GitHub', keyword: 'gh', host: 'github.com', url: 'https://github.com/search?q=%s&type=repositories' },
  { name: 'Wikipedia', keyword: 'w', host: 'wikipedia.org', url: `https://${lang}.wikipedia.org/w/index.php?search=%s`, aliases: ['вики', 'википедия'] },
  { name: 'Reddit', keyword: 'r', host: 'reddit.com', url: 'https://www.reddit.com/search/?q=%s' },
  { name: 'X', keyword: 'x', host: 'x.com', url: 'https://x.com/search?q=%s', aliases: ['twitter'] },
  { name: 'Amazon', keyword: 'amz', host: 'amazon.com', url: 'https://www.amazon.com/s?k=%s' },
  { name: 'Stack Overflow', keyword: 'so', host: 'stackoverflow.com', url: 'https://stackoverflow.com/search?q=%s' },
  { name: 'MDN', keyword: 'mdn', host: 'developer.mozilla.org', url: 'https://developer.mozilla.org/search?q=%s' },
  { name: 'npm', keyword: 'npm', host: 'npmjs.com', url: 'https://www.npmjs.com/search?q=%s' },
  { name: 'Perplexity', keyword: 'pp', host: 'perplexity.ai', url: 'https://www.perplexity.ai/search?q=%s' },
  { name: 'ChatGPT', keyword: 'gpt', host: 'chatgpt.com', url: 'https://chatgpt.com/?q=%s' },
  { name: 'Claude', keyword: 'cl', host: 'claude.ai', url: 'https://claude.ai/new?q=%s' },
  { name: 'DuckDuckGo', keyword: 'ddg', host: 'duckduckgo.com', url: 'https://duckduckgo.com/?q=%s' },
  { name: 'Spotify', keyword: 'sp', host: 'spotify.com', url: 'https://open.spotify.com/search/%s' },
  { name: 'Pinterest', keyword: 'pin', host: 'pinterest.com', url: 'https://www.pinterest.com/search/pins/?q=%s' },
  { name: 'Twitch', keyword: 'tw', host: 'twitch.tv', url: 'https://www.twitch.tv/search?term=%s' },
  { name: 'Figma Community', keyword: 'figma', host: 'figma.com', url: 'https://www.figma.com/community/search?query=%s' },
  { name: 'Яндекс', keyword: 'ya', host: 'ya.ru', url: 'https://ya.ru/search/?text=%s', aliases: ['yandex', 'яндекс'] },
  { name: 'Яндекс Карты', keyword: 'ym', host: 'yandex.ru', url: 'https://yandex.ru/maps/?text=%s', aliases: ['яндекс карты'] },
  { name: 'Яндекс Маркет', keyword: 'market', host: 'market.yandex.ru', url: 'https://market.yandex.ru/search?text=%s', aliases: ['маркет'] },
  { name: 'Ozon', keyword: 'oz', host: 'ozon.ru', url: 'https://www.ozon.ru/search/?text=%s', aliases: ['озон'] },
  { name: 'Wildberries', keyword: 'wb', host: 'wildberries.ru', url: 'https://www.wildberries.ru/catalog/0/search.aspx?search=%s', aliases: ['вб', 'вайлдберриз'] },
  { name: 'Авито', keyword: 'av', host: 'avito.ru', url: 'https://www.avito.ru/rossiya?q=%s', aliases: ['avito', 'авито'] },
  { name: 'Кинопоиск', keyword: 'kp', host: 'kinopoisk.ru', url: 'https://www.kinopoisk.ru/index.php?kp_query=%s', aliases: ['kinopoisk', 'кинопоиск'] },
  { name: 'hh.ru', keyword: 'hh', host: 'hh.ru', url: 'https://hh.ru/search/vacancy?text=%s' },
  { name: 'Хабр', keyword: 'habr', host: 'habr.com', url: 'https://habr.com/ru/search/?q=%s', aliases: ['хабр'] },
  { name: 'VK', keyword: 'vk', host: 'vk.com', url: 'https://vk.com/search?c%5Bq%5D=%s', aliases: ['вк'] },
];

export function engineUrl(e: Engine, q: string): string {
  return e.url.replace(/\{searchTerms\}|%s/g, encodeURIComponent(q));
}

/** Engine named by what was typed: exact keyword/alias/name first, then name or host prefix (≥ 2 chars). */
export function matchEngine(query: string, engines: Engine[]): Engine | null {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  const exact = engines.find((e) => e.keyword === q || e.aliases?.includes(q) || e.name.toLowerCase() === q);
  if (exact) return exact;
  if (q.length < 2 || /\s/.test(q)) return null;
  return engines.find((e) => e.name.toLowerCase().startsWith(q)) ?? engines.find((e) => e.host?.startsWith(q)) ?? null;
}

/** Pull the HTML results template out of an OpenSearch description (no DOMParser in the worker). */
export function parseOpenSearch(xml: string): { name: string; url: string } | null {
  const name = /<ShortName>([^<]{1,60})<\/ShortName>/i.exec(xml)?.[1]?.trim();
  for (const m of xml.matchAll(/<Url\b[^>]*>/gi)) {
    const tag = m[0];
    const type = /type="([^"]+)"/i.exec(tag)?.[1];
    const tpl = /template="([^"]+)"/i.exec(tag)?.[1];
    if (type !== 'text/html' || !tpl || /\{(?!searchTerms)[^}]*[^?]\}/.test(tpl)) continue;
    const url = tpl.replace(/&amp;/g, '&').replace(/\{[^}]*\?\}/g, '');
    if (name && /^https:\/\//.test(url) && url.includes('{searchTerms}')) return { name, url };
  }
  return null;
}
