/**
 * Arc-style site tint: when the selected result is a site, the search pill takes its brand colour.
 * Popular domains are hardcoded; anything else gets the dominant colour of its favicon
 * (read from Chromium's local favicon cache, no network), remembered in localStorage.
 */
import { favicon } from './env';

const BRANDS: Record<string, string> = {
  'youtube.com': '#ff0033', 'music.youtube.com': '#ff0000', 'github.com': '#24292f', 'gitlab.com': '#fc6d26',
  'google.com': '#4285f4', 'mail.google.com': '#ea4335', 'calendar.google.com': '#1a73e8', 'drive.google.com': '#1fa463',
  'docs.google.com': '#4285f4', 'meet.google.com': '#00897b', 'maps.google.com': '#34a853', 'gemini.google.com': '#4b6bfb',
  'x.com': '#0f1419', 'twitter.com': '#1d9bf0', 'facebook.com': '#0866ff', 'instagram.com': '#e1306c', 'threads.net': '#101010',
  'linkedin.com': '#0a66c2', 'reddit.com': '#ff4500', 'wikipedia.org': '#3a3a3a', 'amazon.com': '#ff9900', 'netflix.com': '#e50914',
  'spotify.com': '#1db954', 'figma.com': '#a259ff', 'notion.so': '#191919', 'notion.com': '#191919', 'slack.com': '#4a154b',
  'discord.com': '#5865f2', 'twitch.tv': '#9146ff', 'stackoverflow.com': '#f48024', 'vk.com': '#0077ff', 'ya.ru': '#fc3f1d',
  'yandex.ru': '#fc3f1d', 'dzen.ru': '#111111', 'mail.ru': '#005ff9', 'ozon.ru': '#005bff', 'wildberries.ru': '#cb11ab',
  'avito.ru': '#00aaff', 'habr.com': '#6f9cba', 'hh.ru': '#d6001c', 'kinopoisk.ru': '#ff5500', 't.me': '#26a5e4',
  'web.telegram.org': '#26a5e4', 'telegram.org': '#26a5e4', 'whatsapp.com': '#25d366', 'web.whatsapp.com': '#25d366',
  'chatgpt.com': '#10a37f', 'openai.com': '#10a37f', 'claude.ai': '#d97757', 'anthropic.com': '#d97757', 'perplexity.ai': '#20808d',
  'apple.com': '#1d1d1f', 'medium.com': '#111111', 'dribbble.com': '#ea4c89', 'behance.net': '#1769ff', 'pinterest.com': '#e60023',
  'tiktok.com': '#111111', 'airbnb.com': '#ff385c', 'booking.com': '#003580', 'trello.com': '#0079bf', 'atlassian.net': '#0052cc',
  'vercel.com': '#111111', 'dropbox.com': '#0061ff', 'ticktick.com': '#4772fa', 'linear.app': '#5e6ad2', 'producthunt.com': '#da552f',
  'news.ycombinator.com': '#ff6600', 'coursera.org': '#0056d2', 'udemy.com': '#a435f0', 'zoom.us': '#0b5cff',
  'outlook.live.com': '#0078d4', 'office.com': '#d83b01', 'microsoft.com': '#0078d4', 'bing.com': '#008373', 'canva.com': '#00c4cc',
  'miro.com': '#ffd02f', 'ebay.com': '#e53238', 'aliexpress.com': '#ff4747', 'aliexpress.ru': '#ff4747', 'duckduckgo.com': '#de5833',
  'tbank.ru': '#ffdd2d', 'sberbank.ru': '#21a038', 'figma.site': '#a259ff', 'framer.com': '#0055ff', 'webflow.com': '#146ef5',
  'huggingface.co': '#ffcc4d', 'arc.net': '#3139fb', 'diabrowser.com': '#5e5ce6', 'shopify.com': '#5e8e3e', 'stripe.com': '#635bff',
};

const memo = new Map<string, string | null>();

function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.hostname.replace(/^www\./, '') : null;
  } catch {
    return null;
  }
}

function brand(host: string): string | null {
  for (let h = host; h.includes('.'); h = h.slice(h.indexOf('.') + 1)) if (BRANDS[h]) return BRANDS[h];
  return null;
}

/** Dominant saturated colour of a 32px favicon, or null for grey/monochrome icons. */
function fromFavicon(url: string): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = c.height = 24;
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, 24, 24);
        const d = ctx.getImageData(0, 0, 24, 24).data;
        const bins = new Array(12).fill(0).map(() => ({ w: 0, r: 0, g: 0, b: 0 }));
        for (let i = 0; i < d.length; i += 4) {
          if (d[i + 3] < 200) continue;
          const r = d[i], g = d[i + 1], b = d[i + 2];
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const sat = max ? (max - min) / max : 0;
          if (sat < 0.35 || max < 50) continue;
          let hue = 0;
          if (max === r) hue = ((g - b) / (max - min)) % 6;
          else if (max === g) hue = (b - r) / (max - min) + 2;
          else hue = (r - g) / (max - min) + 4;
          const bin = bins[Math.floor(((hue * 60 + 360) % 360) / 30)];
          const w = sat * sat;
          bin.w += w; bin.r += r * w; bin.g += g * w; bin.b += b * w;
        }
        const best = bins.reduce((a, b) => (b.w > a.w ? b : a));
        if (best.w < 8) return resolve(null);
        const hex = (v: number) => Math.round(v / best.w).toString(16).padStart(2, '0');
        resolve(`#${hex(best.r)}${hex(best.g)}${hex(best.b)}`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = favicon(url, 32);
  });
}

/** Sync answer when known (brand list or memo), otherwise undefined and the promise resolves later. */
export function siteTint(url: string | undefined): { now: string | null | undefined; later?: Promise<string | null> } {
  const host = url && hostOf(url);
  if (!host) return { now: null };
  const b = brand(host);
  if (b) return { now: b };
  if (memo.has(host)) return { now: memo.get(host)! };
  try {
    const saved = localStorage.getItem(`tint:${host}`);
    if (saved !== null) {
      memo.set(host, saved || null);
      return { now: saved || null };
    }
  } catch {}
  const later = fromFavicon(url!).then((c) => {
    memo.set(host, c);
    try {
      localStorage.setItem(`tint:${host}`, c ?? '');
    } catch {}
    return c;
  });
  return { now: undefined, later };
}

/** Pick readable text for a tint. */
export function isLight(hex: string): boolean {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 170;
}
