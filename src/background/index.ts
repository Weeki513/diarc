/**
 * Service worker: shortcut handling, overlay injection/fallback, widget data refresh, OAuth.
 * Kept event-driven so Chrome can suspend it when idle (minimal resource use).
 */
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
  if (await openActionPopup(tab?.windowId)) return;
  await openOverlayWindow(overlayWindowId);
}

/**
 * Fallback #1 for pages where nothing can be injected (Dia's new tab, dia://, Web Store, PDF):
 * the extension's toolbar popup. It drops down inside the browser window, closes on blur,
 * and feels much closer to the overlay than a separate window.
 */
async function openActionPopup(windowId?: number): Promise<boolean> {
  try {
    await chrome.action.setPopup({ popup: 'overlay.html?mode=popup' });
    await chrome.action.openPopup(windowId !== undefined ? { windowId } : undefined);
    return true;
  } catch {
    return false;
  } finally {
    // Keep the icon click as a toggle on normal pages.
    chrome.action.setPopup({ popup: '' }).catch(() => {});
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

/** Fallback #2: a small popup window, if the toolbar popup is unavailable. */
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
