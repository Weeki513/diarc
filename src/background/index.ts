/**
 * Service worker: shortcut handling, overlay injection/fallback, widget data refresh, OAuth.
 * Kept event-driven so Chrome can suspend it when idle (minimal resource use).
 */
import { parseOpenSearch, type Engine } from '../shared/engines';
import type { BgRequest, BgResponse } from '../shared/messages';
import { AuthRequiredError } from '../shared/widget';
import { K } from '../shared/storage';
import { disconnect, getToken, status } from './auth';
import { loadSettingOptions, pruneCache, refreshStale, runAction, runCommand } from './widgets';

const OVERLAY_WINDOW_KEY = 'overlayWindowId';
const RESTRICTED = /^(chrome|dia|edge|brave|about|chrome-extension|chrome-search|devtools|view-source|data|blob):|^https:\/\/(chrome\.google\.com\/webstore|chromewebstore\.google\.com)/;

// ---------- Toggle ----------

async function toggle(tab?: chrome.tabs.Tab): Promise<void> {
  // Warm widget data in parallel with showing the UI (stale-while-revalidate, 60s).
  refreshStale(60_000).catch(() => {});

  const win = await chrome.storage.session.get(OVERLAY_WINDOW_KEY);
  const overlayWindowId = win[OVERLAY_WINDOW_KEY] as number | undefined;
  if (overlayWindowId !== undefined && tab?.windowId === overlayWindowId) {
    await chrome.windows.remove(overlayWindowId).catch(() => {});
    return;
  }

  if (tab?.id !== undefined && tab.url && !RESTRICTED.test(tab.url)) {
    if (await sendToggle(tab.id)) return;
    // Tab loaded before the extension was installed/updated: inject now.
    try {
      await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
      if (await sendToggle(tab.id)) return;
    } catch {
      /* fall through */
    }
  }
  if (tab?.id !== undefined && (await openInTab(tab))) return;
  await openOverlayWindow(overlayWindowId);
}

const OVERLAY_URL = () => chrome.runtime.getURL('overlay.html');
const isNewTab = (url = '') => !url || /^(chrome|dia|edge|brave):\/\/(newtab|new-tab-page)|^about:(blank|newtab)$|^chrome-search:/.test(url);

/**
 * Pages nothing can be injected into (Dia's new tab, dia://, Web Store, PDF):
 * show the bar as a page inside the browser instead of a separate window.
 * An empty new tab is replaced in place (Esc goes back to it); otherwise a tab opens next to it.
 */
async function openInTab(tab: chrome.tabs.Tab): Promise<boolean> {
  try {
    const url = tab.url || tab.pendingUrl || '';
    if (url.startsWith(OVERLAY_URL())) {
      // Toggle off: the bar itself is the active tab.
      if (url.includes('origin=replace')) await chrome.tabs.goBack(tab.id!).catch(() => chrome.tabs.remove(tab.id!));
      else await chrome.tabs.remove(tab.id!);
      return true;
    }
    if (isNewTab(url)) {
      await chrome.tabs.update(tab.id!, { url: `overlay.html?mode=tab&origin=replace` });
    } else {
      await chrome.tabs.create({ url: `overlay.html?mode=tab&origin=new&from=${tab.id}`, index: tab.index + 1, windowId: tab.windowId });
    }
    return true;
  } catch {
    return false;
  }
}

async function sendToggle(tabId: number): Promise<boolean> {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { diarc: 'toggle' });
    return !!res?.ok;
  } catch {
    return false;
  }
}

/** Last resort: a small popup window. */
async function openOverlayWindow(existing?: number): Promise<void> {
  if (existing !== undefined) {
    try {
      await chrome.windows.update(existing, { focused: true });
      return;
    } catch {
      /* window is gone */
    }
  }
  const width = 780;
  const height = 620;
  let left: number | undefined;
  let top: number | undefined;
  try {
    const cur = await chrome.windows.getLastFocused({ windowTypes: ['normal'] });
    if (cur.left !== undefined && cur.width !== undefined && cur.top !== undefined && cur.height !== undefined) {
      left = Math.round(cur.left + (cur.width - width) / 2);
      top = Math.round(cur.top + Math.max(40, (cur.height - height) / 4));
    }
  } catch {}
  const w = await chrome.windows.create({ url: 'overlay.html?mode=window', type: 'popup', width, height, left, top, focused: true });
  if (w) await chrome.storage.session.set({ [OVERLAY_WINDOW_KEY]: w.id });
}

chrome.windows.onRemoved.addListener(async (id) => {
  const r = await chrome.storage.session.get(OVERLAY_WINDOW_KEY);
  if (r[OVERLAY_WINDOW_KEY] === id) await chrome.storage.session.remove(OVERLAY_WINDOW_KEY);
});

chrome.commands.onCommand.addListener((command, tab) => {
  if (command !== 'toggle-command-bar') return;
  if (tab) toggle(tab);
  else chrome.tabs.query({ active: true, lastFocusedWindow: true }).then(([t]) => toggle(t));
});

chrome.action.onClicked.addListener((tab) => toggle(tab));

// ---------- Messages from the overlay / options page ----------

chrome.runtime.onMessage.addListener((msg: BgRequest, sender, sendResponse: (r: BgResponse) => void) => {
  if (sender.id !== chrome.runtime.id || !msg || typeof msg !== 'object' || !('type' in msg)) return;
  if (msg.type === 'engine:found') {
    learnEngine(msg.href, sender.tab?.url);
    return;
  }
  handle(msg)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((e: Error) =>
      sendResponse({ ok: false, error: e.message, needsAuth: e instanceof AuthRequiredError ? e.provider : undefined }),
    );
  return true;
});

async function handle(msg: BgRequest): Promise<unknown> {
  switch (msg.type) {
    case 'widget:refresh':
      return refreshStale(msg.force ? 0 : 60_000, msg.ids, msg.force);
    case 'widget:action':
      return runAction(msg.id, msg.action, msg.payload);
    case 'widget:options':
      return loadSettingOptions(msg.id, msg.key);
    case 'widget:command':
      return runCommand(msg.widget, msg.command, msg.text);
    case 'auth:connect':
      await getToken({ provider: msg.provider, scopes: msg.scopes }, true);
      refreshStale(0, undefined, true);
      return;
    case 'auth:disconnect':
      await disconnect(msg.provider);
      return;
    case 'auth:status':
      return status();
    case 'overlay:closed':
      return;
  }
}

// ---------- Lifecycle ----------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  chrome.alarms.create('refresh', { periodInMinutes: 1 });
  // Inject the content script into tabs that were open before install/update.
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  await Promise.allSettled(
    tabs.filter((t) => t.id !== undefined && !t.discarded).map((t) => chrome.scripting.executeScript({ target: { tabId: t.id! }, files: ['content.js'] })),
  );
  if (reason === 'install') chrome.runtime.openOptionsPage();
  // New version may change what widgets fetch: refresh everything once.
  if (reason === 'update') refreshStale(0, undefined, true).catch(() => {});
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create('refresh', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name === 'refresh') refreshStale().catch(() => {});
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[K.layout]) {
    pruneCache();
    refreshStale();
  }
});

// ---- Tab-to-search: remember OpenSearch engines of sites the user visits ----
const AUTO_ENGINES_MAX = 150;
const seenEngineHosts = new Set<string>();

async function learnEngine(href: string, pageUrl: string | undefined): Promise<void> {
  try {
    if (!pageUrl) return;
    const page = new URL(pageUrl);
    const desc = new URL(href, page);
    const host = page.hostname.replace(/^www\./, '');
    if (page.protocol !== 'https:' || seenEngineHosts.has(host)) return;
    seenEngineHosts.add(host);
    const stored = ((await chrome.storage.local.get('engines:auto'))['engines:auto'] ?? {}) as Record<string, Engine>;
    if (stored[host]) return;
    const res = await fetch(desc, { credentials: 'omit' });
    if (!res.ok) return;
    const parsed = parseOpenSearch((await res.text()).slice(0, 20_000));
    if (!parsed) return;
    // Only accept a template that searches the same site that announced it.
    const tplHost = new URL(parsed.url.replace('{searchTerms}', 'x')).hostname.replace(/^www\./, '');
    if (tplHost !== host && !tplHost.endsWith(`.${host}`) && !host.endsWith(`.${tplHost}`)) return;
    const keys = Object.keys(stored);
    if (keys.length >= AUTO_ENGINES_MAX) delete stored[keys[0]];
    stored[host] = { name: parsed.name, keyword: host, host, url: parsed.url, source: 'auto' };
    await chrome.storage.local.set({ 'engines:auto': stored });
  } catch {
    /* ignore: discovery is best effort */
  }
}
