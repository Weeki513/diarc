/**
 * Overlay environment:
 *  - frame:  iframe over a regular page (the normal case)
 *  - tab:    the bar shown as a page in a browser tab, for pages nothing can be injected into
 *            (Dia's new tab is replaced in place; for dia://, Web Store, PDF a tab opens next to it)
 *  - window / popup: last-resort fallbacks
 */
export type Mode = 'frame' | 'tab' | 'popup' | 'window' | 'page';
const params = new URLSearchParams(location.search);
export const MODE: Mode = (params.get('mode') as Mode) ?? 'page';
/** In tab mode: 'replace' = this tab was Dia's new tab; 'new' = opened next to `from`. */
export const TAB_ORIGIN = params.get('origin') as 'replace' | 'new' | null;
const FROM_TAB = Number(params.get('from')) || undefined;

let closer: () => void = () => {};
export function setCloser(fn: () => void) {
  closer = fn;
}
/** Close the command bar (hides the iframe, or closes the popup window). */
export function closeBar() {
  closer();
}

/** The tab the user was looking at when the bar opened. */
export async function targetTab(): Promise<chrome.tabs.Tab | undefined> {
  if (MODE === 'frame' || (MODE === 'tab' && TAB_ORIGIN === 'replace')) {
    const t = await chrome.tabs.getCurrent();
    if (t) return t;
  }
  if (MODE === 'tab' && FROM_TAB) {
    const t = await chrome.tabs.get(FROM_TAB).catch(() => undefined);
    if (t) return t;
  }
  try {
    const win = await chrome.windows.getLastFocused({ windowTypes: ['normal'], populate: true });
    return win.tabs?.find((t) => t.active);
  } catch {
    return undefined;
  }
}

export function favicon(pageUrl: string, size = 32): string {
  const u = new URL(chrome.runtime.getURL('/_favicon/'));
  u.searchParams.set('pageUrl', pageUrl);
  u.searchParams.set('size', String(size));
  return u.toString();
}

export async function focusTab(tab: chrome.tabs.Tab) {
  closeBar();
  await chrome.tabs.update(tab.id!, { active: true });
  await chrome.windows.update(tab.windowId, { focused: true });
}

/** Open a URL. Reuses an open tab with the same URL when there is one. */
export async function openUrl(url: string, newTab = true) {
  const existing = (await chrome.tabs.query({})).find((t) => t.url === url || t.pendingUrl === url);
  if (existing) return focusTab(existing);
  if (MODE === 'tab') {
    // The bar occupies a tab of its own: load the result right here.
    const self = await chrome.tabs.getCurrent();
    if (self?.id !== undefined) return void chrome.tabs.update(self.id, { url });
  }
  const cur = await targetTab();
  closeBar();
  if (!newTab && cur?.id !== undefined) await chrome.tabs.update(cur.id, { url });
  else await chrome.tabs.create({ url, windowId: cur?.windowId, index: cur ? cur.index + 1 : undefined });
  if (cur) chrome.windows.update(cur.windowId, { focused: true }).catch(() => {});
}

export async function webSearch(text: string, newTab = true) {
  if (MODE === 'tab') {
    const self = await chrome.tabs.getCurrent();
    if (self?.id !== undefined) return chrome.search.query({ text, tabId: self.id });
  }
  const cur = await targetTab();
  closeBar();
  if (cur && !newTab) await chrome.search.query({ text, tabId: cur.id });
  else await chrome.search.query({ text, disposition: 'NEW_TAB' });
}

export function looksLikeUrl(q: string): string | null {
  const s = q.trim();
  if (!s || /\s/.test(s)) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(about|chrome|dia|file):/i.test(s)) return s;
  if (/^localhost(:\d+)?(\/|$)/i.test(s) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/|$)/.test(s)) return `http://${s}`;
  if (/^[^./]+(\.[^./]+)*\.[a-z]{2,}(:\d+)?(\/.*)?$/i.test(s)) return `https://${s}`;
  return null;
}
