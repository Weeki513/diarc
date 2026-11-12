/**
 * Content script (~2 KB). Owns nothing but a full-viewport iframe in a closed Shadow DOM.
 * The UI runs inside the iframe (an extension page), so the page can neither read widget
 * data (emails, events) nor intercept keystrokes, and page CSS cannot break the bar.
 *
 * Speed:
 *  - With `prewarm` on, the iframe is created hidden once the tab is visible and idle,
 *    so opening is just a style flip + focus.
 *  - Cold open shows a native-looking shell input immediately and forwards what was typed
 *    once the iframe reports `ready`.
 *  - Iframes of tabs hidden for 5 minutes are dropped to keep memory low.
 */
type W = Window & { __diarc?: boolean };

(() => {
  if (window.top !== window || (window as W).__diarc) return;
  (window as W).__diarc = true;

  const ORIGIN = new URL(chrome.runtime.getURL('')).origin;
  const UNLOAD_AFTER_MS = 5 * 60_000;

  let host: HTMLElement | null = null;
  let root: ShadowRoot | null = null;
  let frame: HTMLIFrameElement | null = null;
  let shell: HTMLElement | null = null;
  let shellInput: HTMLInputElement | null = null;
  let ready = false;
  let open = false;
  let lastFocus: Element | null = null;
  let unloadTimer: number | undefined;

  const CSS = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; display: none; }
    iframe { position: absolute; inset: 0; width: 100%; height: 100%; border: 0; background: transparent; color-scheme: normal; }
    .shell { position: absolute; inset: 0; background: rgba(0,0,0,.18); font: 16px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; }
    .bar { position: absolute; left: 50%; top: 14vh; transform: translateX(-50%); width: min(760px, calc(100vw - 32px)); height: 58px; box-sizing: border-box;
      border-radius: 18px; background: rgba(250,250,252,.92); box-shadow: 0 30px 80px rgba(0,0,0,.28), 0 0 0 .5px rgba(0,0,0,.12); backdrop-filter: blur(30px) saturate(1.6); }
    .bar input { all: unset; box-sizing: border-box; width: 100%; height: 100%; padding: 0 20px 0 52px; font-size: 19px; color: #111; }
    .bar svg { position: absolute; left: 20px; top: 20px; opacity: .45; }
    @media (prefers-color-scheme: dark) {
      .bar { background: rgba(36,36,40,.92); box-shadow: 0 30px 80px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.12); }
      .bar input { color: #f2f2f4; } .bar svg { stroke: #fff; }
    }`;

  function ensureHost(): void {
    if (host) return;
    host = document.createElement('diarc-overlay');
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.append(style);
    // Keep page shortcuts from seeing keys typed into the shell.
    for (const t of ['keydown', 'keyup', 'keypress']) host.addEventListener(t, (e) => e.stopPropagation());
    host.addEventListener('mousedown', (e) => {
      if (e.composedPath()[0] === shell) hide();
    });
    document.documentElement.append(host);
  }

  function ensureFrame(): void {
    ensureHost();
    if (frame) return;
    frame = document.createElement('iframe');
    frame.src = chrome.runtime.getURL('overlay.html?mode=frame');
    frame.allow = 'clipboard-write';
    frame.setAttribute('allowtransparency', 'true');
    frame.style.visibility = 'hidden';
    root!.append(frame);
  }

  function showShell(): void {
    if (shell) return;
    shell = document.createElement('div');
    shell.className = 'shell';
    shell.innerHTML =
      '<div class="bar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><input placeholder="Поиск или URL" autocomplete="off" spellcheck="false"></div>';
    shellInput = shell.querySelector('input');
    root!.append(shell);
    shellInput!.focus();
  }

  function post(msg: unknown): void {
    frame?.contentWindow?.postMessage(msg, ORIGIN);
  }

  function reveal(): void {
    const text = shellInput?.value ?? '';
    shell?.remove();
    shell = shellInput = null;
    frame!.style.visibility = 'visible';
    frame!.focus();
    post({ diarc: 'open', text });
  }

  function show(): void {
    clearTimeout(unloadTimer);
    lastFocus = document.activeElement;
    ensureFrame();
    host!.style.display = 'block';
    open = true;
    if (ready) reveal();
    else showShell();
  }

  function hide(): void {
    if (!open) return;
    open = false;
    post({ diarc: 'hide' });
    host!.style.display = 'none';
    if (frame) frame.style.visibility = 'hidden';
    shell?.remove();
    shell = shellInput = null;
    if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true });
  }

  function unload(): void {
    if (open || !frame) return;
    frame.remove();
    frame = null;
    ready = false;
  }

  window.addEventListener('message', (e) => {
    if (!frame || e.source !== frame.contentWindow || e.origin !== ORIGIN) return;
    const d = e.data as { diarc?: string };
    if (d?.diarc === 'ready') {
      ready = true;
      if (open) reveal();
    } else if (d?.diarc === 'close') hide();
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.diarc === 'toggle') {
      open ? hide() : show();
      sendResponse({ ok: true });
    }
  });

  // ---- Prewarm / unload ----
  let prewarm = true;
  chrome.storage.local.get('settings').then((r) => {
    prewarm = (r.settings as { prewarm?: boolean } | undefined)?.prewarm ?? true;
    schedulePrewarm();
  });

  function schedulePrewarm(): void {
    if (!prewarm || frame || document.visibilityState !== 'visible') return;
    const run = () => requestIdleCallback(() => document.visibilityState === 'visible' && ensureFrame(), { timeout: 3000 });
    if (document.readyState === 'complete') run();
    else window.addEventListener('load', run, { once: true });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      clearTimeout(unloadTimer);
      schedulePrewarm();
    } else {
      hide();
      unloadTimer = window.setTimeout(unload, UNLOAD_AFTER_MS);
    }
  });
})();
