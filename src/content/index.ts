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
import { GLASS_CSS, GlassLayer, type GlassMode, type GlassMsg, type Tune } from './glass';

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
  let glass: GlassLayer | null = null;
  let glassMode: GlassMode = 'liquid';
  let glassTune: Tune | undefined;

  const CSS = `
    :host { all: initial; position: fixed; inset: 0; z-index: 2147483647; display: none; pointer-events: none; }
    iframe { position: absolute; left: 50%; top: calc(14vh - 40px); transform: translateX(-50%); width: min(880px, 100vw); height: 120px;
      border: 0; background: transparent; color-scheme: light; pointer-events: auto; }
    .shell { position: absolute; inset: 0; background: transparent; pointer-events: none; font: 16px -apple-system, BlinkMacSystemFont, "SF Pro Text", system-ui, sans-serif; }
    .bar { position: absolute; left: 50%; top: 14vh; transform: translateX(-50%); width: min(760px, calc(100vw - 32px)); height: 58px; box-sizing: border-box; pointer-events: auto;
      border-radius: 29px; background: rgba(255,255,255,.55); backdrop-filter: blur(14px) saturate(1.7);
      box-shadow: 0 10px 30px rgba(0,0,0,.18), inset 0 1px 0 rgba(255,255,255,.7), 0 0 0 .5px rgba(0,0,0,.08); }
    .bar input { all: unset; box-sizing: border-box; width: 100%; height: 100%; padding: 0 20px 0 52px; font-size: 19px; color: #111; }
    .bar svg { position: absolute; left: 20px; top: 20px; opacity: .45; }
    @media (prefers-color-scheme: dark) {
      .bar { background: rgba(30,30,34,.5); box-shadow: 0 10px 30px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.18), 0 0 0 .5px rgba(255,255,255,.1); }
      .bar input { color: #f2f2f4; } .bar svg { stroke: #fff; }
    }
    iframe { z-index: 1; } .shell { z-index: 2; }
    iframe.ambient { left: 0; top: 0; transform: none; width: 100vw; height: 100vh; pointer-events: none; z-index: 0; visibility: visible; }
    ${GLASS_CSS}`;

  function ensureHost(): void {
    if (host) return;
    host = document.createElement('diarc-overlay');
    root = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = CSS;
    root.append(style);
    glass = new GlassLayer(root, glassMode, glassTune);
    // Keep page shortcuts from seeing keys typed into the shell.
    for (const t of ['keydown', 'keyup', 'keypress']) host.addEventListener(t, (e) => e.stopPropagation());
    // The page stays interactive around the bar (scroll, select); a click outside closes it.
    document.addEventListener(
      'mousedown',
      (e) => {
        if (open && !e.composedPath().includes(host!)) hide();
      },
      true,
    );
    window.addEventListener('resize', () => open && sendViewport());
    document.documentElement.append(host);
  }

  // ---- Ambient creatures (ambient.html in its own click-through iframe, under the glass) ----
  type Amb = { show?: 'off' | 'bar' | 'always'; exclude?: string[] };
  let amb: Amb = { show: 'bar' };
  let ambFrame: HTMLIFrameElement | null = null;
  let ambRaf = 0;
  let ambPt: { x: number; y: number } | null = null;
  const hostName = location.hostname.replace(/^www\./, '');
  const ambAllowed = () => amb.show !== 'off' && !(amb.exclude ?? []).some((h) => hostName === h || hostName.endsWith(`.${h}`));
  const ambPost = (m: unknown) => ambFrame?.contentWindow?.postMessage(m, ORIGIN);
  const ambMove = (e: MouseEvent) => {
    ambPt = { x: e.clientX, y: e.clientY };
    if (!ambRaf) ambRaf = requestAnimationFrame(() => { ambRaf = 0; if (ambPt) ambPost({ diarc: 'amb-pointer', ...ambPt }); });
  };
  const ambClick = (e: MouseEvent) => ambPost({ diarc: 'amb-click', x: e.clientX, y: e.clientY });
  const ambOut = () => ambPost({ diarc: 'amb-leave' });

  function ambient(on: boolean): void {
    on = on && ambAllowed();
    if (on && !ambFrame) {
      ensureHost();
      ambFrame = document.createElement('iframe');
      ambFrame.className = 'ambient';
      ambFrame.src = chrome.runtime.getURL('ambient.html');
      ambFrame.setAttribute('allowtransparency', 'true');
      root!.prepend(ambFrame);
    }
    if (!ambFrame) return;
    ambFrame.style.display = on ? 'block' : 'none';
    ambPost({ diarc: on ? 'amb-play' : 'amb-pause' });
    if (on && !open) host!.style.display = 'block';
    const f = on ? addEventListener : removeEventListener;
    f('mousemove', ambMove as EventListener, true);
    f('click', ambClick as EventListener, true);
    document.documentElement[on ? 'addEventListener' : 'removeEventListener']('mouseleave', ambOut);
  }
  /** Apply the ambient setting to this page (always-on pages start once idle). */
  function ambientSync(): void {
    const always = amb.show === 'always' && ambAllowed() && document.visibilityState === 'visible';
    if (always) requestIdleCallback(() => ambient(true), { timeout: 2000 });
    else if (!open || amb.show !== 'bar') ambient(false);
    if (!open && !always && host) host.style.display = 'none';
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

  function sendViewport(): void {
    post({ diarc: 'viewport', h: window.innerHeight });
  }

  // ---- While open: feed the bar the page's brightness (adaptive glass), cursor and scroll (live rim light) ----
  let liveRaf = 0;
  let lastPointer: { x: number; y: number } | null = null;
  let lastLuma = -1;
  let lumaAt = 0;

  /** Average brightness of what is behind the bar, from the backgrounds of the elements there. */
  function backdropLuma(): number {
    const r = frame!.getBoundingClientRect();
    const xs = [0.1, 0.3, 0.5, 0.7, 0.9].map((k) => r.left + r.width * k);
    const ys = [0.1, 0.35, 0.6, 0.85].map((k) => r.top + Math.min(r.height, innerHeight - r.top) * k);
    let sum = 0, n = 0;
    for (const x of xs) for (const y of ys) {
      let rgb: number[] | null = null;
      for (const el of document.elementsFromPoint(x, y)) {
        if (el === host) continue;
        if (el instanceof HTMLImageElement || el instanceof HTMLVideoElement || el instanceof HTMLCanvasElement) { rgb = [110, 110, 110]; break; }
        const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(getComputedStyle(el).backgroundColor);
        if (m && (m[4] === undefined || +m[4] > 0.5)) { rgb = [+m[1], +m[2], +m[3]]; break; }
      }
      if (!rgb) rgb = matchMedia('(prefers-color-scheme: dark)').matches && getComputedStyle(document.documentElement).colorScheme.includes('dark') ? [20, 20, 20] : [255, 255, 255];
      sum += (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
      n++;
    }
    return n ? sum / n : 1;
  }

  function sendLive(): void {
    liveRaf = 0;
    if (!open || !frame) return;
    const r = frame.getBoundingClientRect();
    if (lastPointer) post({ diarc: 'pointer', x: lastPointer.x - r.left, y: lastPointer.y - r.top });
    post({ diarc: 'scroll', y: scrollY });
    const now = performance.now();
    if (now - lumaAt > 180) {
      lumaAt = now;
      const l = backdropLuma();
      if (Math.abs(l - lastLuma) > 0.04) post({ diarc: 'backdrop', luma: (lastLuma = l) });
    }
  }
  const queueLive = () => {
    if (!liveRaf) liveRaf = requestAnimationFrame(sendLive);
  };
  const onPointer = (e: MouseEvent) => {
    lastPointer = { x: e.clientX, y: e.clientY };
    queueLive();
  };
  function live(on: boolean): void {
    const f = on ? addEventListener : removeEventListener;
    f('mousemove', onPointer as EventListener, { capture: true, passive: true } as AddEventListenerOptions);
    f('scroll', queueLive, { capture: true, passive: true } as AddEventListenerOptions);
    if (on) {
      lastLuma = -1;
      lumaAt = 0;
      queueLive();
      setTimeout(queueLive, 250); // after the first glass layout
    }
  }

  function reveal(): void {
    const text = shellInput?.value ?? '';
    shell?.remove();
    shell = shellInput = null;
    frame!.style.visibility = 'visible';
    glass?.flash();
    live(true);
    frame!.focus();
    sendViewport();
    post({ diarc: 'open', text });
  }

  function show(): void {
    clearTimeout(unloadTimer);
    lastFocus = document.activeElement;
    ensureFrame();
    host!.style.display = 'block';
    open = true;
    if (amb.show === 'bar') ambient(true);
    if (ready) reveal();
    else showShell();
  }

  function hide(): void {
    if (!open) return;
    open = false;
    post({ diarc: 'hide' });
    if (amb.show === 'always' && ambFrame && ambAllowed()) host!.style.display = 'block';
    else {
      host!.style.display = 'none';
      ambient(false);
    }
    if (frame) frame.style.visibility = 'hidden';
    glass?.clear();
    live(false);
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
    else if (d?.diarc === 'glass') {
      if (!open) return;
      const r = frame.getBoundingClientRect();
      glass?.update(d as unknown as GlassMsg, { x: r.left, y: r.top });
    } else if (d?.diarc === 'size' && typeof (d as { h?: number }).h === 'number') {
      frame.style.height = `${Math.min((d as { h: number }).h, window.innerHeight)}px`;
    }
  });

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg?.diarc === 'toggle') {
      open ? hide() : show();
      sendResponse({ ok: true });
    }
  });

  // ---- Tab-to-search: report the site's OpenSearch description (if any) once per page ----
  const findEngine = () => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="search"][type="application/opensearchdescription+xml"]');
    if (link?.href && location.protocol === 'https:') chrome.runtime.sendMessage({ type: 'engine:found', href: link.href }).catch(() => {});
  };
  if (document.readyState === 'complete') setTimeout(findEngine, 2000);
  else window.addEventListener('load', () => setTimeout(findEngine, 2000), { once: true });

  // ---- Prewarm / unload ----
  let prewarm = true;
  type S = { prewarm?: boolean; glass?: GlassMode; glassTune?: Tune; ambient?: Amb } | undefined;
  chrome.storage.local.get('settings').then((r) => {
    prewarm = (r.settings as S)?.prewarm ?? true;
    glassMode = (r.settings as S)?.glass ?? 'liquid';
    glassTune = (r.settings as S)?.glassTune;
    amb = { show: 'bar', ...(r.settings as S)?.ambient };
    if (document.readyState === 'complete') ambientSync();
    else addEventListener('load', ambientSync, { once: true });
    glass?.setMode(glassMode);
    if (glassTune) glass?.setTune(glassTune);
    schedulePrewarm();
  });
  chrome.storage.onChanged.addListener((c, area) => {
    if (area !== 'local' || !c.settings) return;
    const next = c.settings.newValue as S;
    amb = { show: 'bar', ...next?.ambient };
    ambientSync();
    glassMode = next?.glass ?? 'liquid';
    glass?.setMode(glassMode);
    if (next?.glassTune && JSON.stringify(next.glassTune) !== JSON.stringify(glassTune)) glass?.setTune((glassTune = next.glassTune));
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
      ambientSync();
      schedulePrewarm();
    } else {
      hide();
      unloadTimer = window.setTimeout(unload, UNLOAD_AFTER_MS);
    }
  });
})();
