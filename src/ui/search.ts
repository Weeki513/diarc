/** Search across tabs, bookmarks, history, commands and widget commands. */
import { score, terms as toTerms } from './fuzzy';
import type { Command } from './commands';
import { looksLikeUrl } from './env';
import { widgets } from '../widgets/registry';

export type ResultKind = 'tab' | 'bookmark' | 'history' | 'command' | 'widget-command' | 'url' | 'search';

export interface Result {
  key: string;
  kind: ResultKind;
  title: string;
  subtitle?: string;
  url?: string;
  icon?: string;
  score: number;
  tab?: chrome.tabs.Tab;
  command?: Command;
  widgetCommand?: { widget: string; command: string; text: string };
}

const KIND_WEIGHT: Record<ResultKind, number> = {
  'widget-command': 10,
  url: 5,
  tab: 1.3,
  bookmark: 1.15,
  command: 1.1,
  history: 1,
  search: 0,
};

export function prettyUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      const path = u.pathname === '/' ? '' : decodeURIComponent(u.pathname);
      return u.hostname.replace(/^www\./, '') + path;
    }
  } catch {}
  return url;
}

/** Results computable synchronously (instant first paint while history loads). */
export function syncResults(q: string, tabs: chrome.tabs.Tab[], commands: Command[]): Result[] {
  const query = q.trim();
  if (!query) return [];
  const t = toTerms(query);
  const out: Result[] = [];

  // Widget prefix commands: "t купить молоко", "e созвон завтра в 15"
  const [first, ...rest] = query.split(/\s+/);
  const restText = rest.join(' ');
  if (restText) {
    for (const def of widgets.values()) {
      for (const c of def.commands ?? []) {
        if (c.prefix.some((p) => p.toLowerCase() === first.toLowerCase())) {
          out.push({
            key: `wc:${def.id}:${c.id}`,
            kind: 'widget-command',
            title: `${c.title}: «${restText}»`,
            subtitle: c.hint ?? def.name,
            icon: def.icon,
            score: 1,
            widgetCommand: { widget: def.id, command: c.id, text: restText },
          });
        }
      }
    }
  }

  const url = looksLikeUrl(query);
  if (url) out.push({ key: `url:${url}`, kind: 'url', title: `Открыть ${prettyUrl(url)}`, url, score: 1 });

  for (const tab of tabs) {
    const s = score(t, tab.title ?? '', tab.url ?? '');
    if (s > 0) out.push({ key: `tab:${tab.id}`, kind: 'tab', title: tab.title || tab.url || '', subtitle: prettyUrl(tab.url ?? ''), url: tab.url, score: s, tab });
  }
  for (const c of commands) {
    const s = score(t, c.title, c.keywords);
    if (s > 0.3) out.push({ key: `cmd:${c.id}`, kind: 'command', title: c.title, icon: c.icon, score: s, command: c });
  }
  return out;
}

export async function asyncResults(q: string): Promise<Result[]> {
  const query = q.trim();
  if (!query) return [];
  const t = toTerms(query);
  const [history, bookmarks] = await Promise.all([
    chrome.history.search({ text: query, maxResults: 60, startTime: 0 }).catch(() => [] as chrome.history.HistoryItem[]),
    chrome.bookmarks.search(query).catch(() => [] as chrome.bookmarks.BookmarkTreeNode[]),
  ]);
  const out: Result[] = [];
  for (const b of bookmarks) {
    if (!b.url) continue;
    const s = score(t, b.title, b.url);
    if (s > 0) out.push({ key: `bm:${b.id}`, kind: 'bookmark', title: b.title || b.url, subtitle: prettyUrl(b.url), url: b.url, score: s });
  }
  const now = Date.now();
  for (const h of history) {
    if (!h.url) continue;
    const s = score(t, h.title ?? '', h.url);
    if (s < 0.3) continue;
    const ageDays = (now - (h.lastVisitTime ?? 0)) / 86_400_000;
    const boost = Math.log10(1 + (h.typedCount ?? 0) * 2 + (h.visitCount ?? 0)) * 0.15 + Math.max(0, 0.15 - ageDays * 0.005);
    out.push({ key: `h:${h.id}`, kind: 'history', title: h.title || prettyUrl(h.url), subtitle: prettyUrl(h.url), url: h.url, score: s + boost });
  }
  return out;
}

/** Merge, dedupe by URL (tabs win), rank, and place the web-search row. */
export function rank(q: string, items: Result[], limit = 12): Result[] {
  const byUrl = new Map<string, Result>();
  const rest: Result[] = [];
  const pri: ResultKind[] = ['tab', 'bookmark', 'history'];
  for (const r of items) {
    if (!r.url || r.kind === 'url') {
      rest.push(r);
      continue;
    }
    const key = r.url.replace(/#.*$/, '').replace(/\/$/, '');
    const prev = byUrl.get(key);
    if (!prev || pri.indexOf(r.kind) < pri.indexOf(prev.kind)) byUrl.set(key, prev ? { ...r, score: Math.max(r.score, prev.score) } : r);
  }
  const all = [...rest, ...byUrl.values()].sort((a, b) => b.score * KIND_WEIGHT[b.kind] - a.score * KIND_WEIGHT[a.kind]).slice(0, limit);
  const search: Result = { key: 'search', kind: 'search', title: q.trim(), subtitle: 'Искать в интернете', score: 0 };
  const strong = all.length > 0 && all[0].score * KIND_WEIGHT[all[0].kind] >= 0.9;
  return strong ? [...all, search] : [search, ...all];
}
