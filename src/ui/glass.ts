/**
 * Frame mode: tells the content script where the glass pieces (`.glass`) are, so it can place
 * refracting plates under them on the page (see src/content/glass.ts). Re-measures only when
 * something can have moved: resize, scroll, DOM/class changes, drags; coalesced to one rAF.
 */
export function startGlassReporter(panel: HTMLElement): { stop(): void; kick(): void } {
  let raf = 0;
  let last = '';

  const measure = () => {
    raf = 0;
    const wrap = panel.querySelector<HTMLElement>('.grid-wrap');
    const wr = wrap && wrap.checkVisibility({ visibilityProperty: true }) ? wrap.getBoundingClientRect() : null;
    const plates: { x: number; y: number; w: number; h: number; r: number; c: 0 | 1 }[] = [];
    for (const el of panel.querySelectorAll<HTMLElement>('.glass')) {
      if (!el.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      const r = el.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) continue;
      const inGrid = !!wr && wrap!.contains(el);
      if (inGrid && (r.bottom <= wr!.top || r.top >= wr!.bottom)) continue;
      plates.push({ x: r.left, y: r.top, w: r.width, h: r.height, r: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, c: inGrid ? 1 : 0 });
    }
    const msg = { diarc: 'glass', plates, clip: wr ? { x: wr.left, y: wr.top, w: wr.width, h: wr.height } : null };
    const json = JSON.stringify(msg);
    if (json === last) return;
    last = json;
    parent.postMessage(msg, '*');
  };
  const schedule = () => {
    if (!raf) raf = requestAnimationFrame(measure);
  };
  /** Follow CSS transitions/animations for a moment (open, resize of a tile). */
  const follow = (ms = 260) => {
    const until = performance.now() + ms;
    const tick = () => {
      measure();
      if (performance.now() < until) raf = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(tick);
  };

  const ro = new ResizeObserver(schedule);
  ro.observe(panel);
  const mo = new MutationObserver(() => {
    schedule();
    for (const el of panel.querySelectorAll('.glass, .grid')) ro.observe(el);
  });
  mo.observe(panel, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  for (const el of panel.querySelectorAll('.glass, .grid')) ro.observe(el);
  document.addEventListener('scroll', schedule, true);
  document.addEventListener('transitionend', () => follow(0), true);

  return {
    stop() {
      ro.disconnect();
      mo.disconnect();
      document.removeEventListener('scroll', schedule, true);
    },
    /** The bar was (re)opened: the content script cleared its plates, so resend. */
    kick() {
      last = '';
      follow();
    },
  };
}

/**
 * One light for the whole bar, so it behaves like a single organism instead of every piece
 * flashing in sync. The rims are lit by fixed-attachment gradients (viewport coordinates), so
 * the same light field spans the search pill, every tile and the footer:
 *  - a key light that drifts with page/widget scroll,
 *  - a cursor light that follows the pointer on a spring (it lags and overshoots a little),
 *  - a ripple that runs across all pieces from the search field when the bar opens.
 * Plus adaptive contrast: the content script reports how bright the page behind is.
 */
export function startLight(): { wave(): void } {
  const html = document.documentElement;
  const set = (k: string, v: string) => html.style.setProperty(k, v);
  let pageScroll = 0, innerScroll = 0;
  let tx = -2000, ty = -2000; // target (pointer)
  let x = -2000, y = -2000, vx = 0, vy = 0; // spring state
  let raf = 0;
  let waveStart = 0;

  const key = () => {
    const s = (pageScroll + innerScroll) / 420;
    set('--kx', `${(innerWidth * (0.32 + 0.22 * Math.sin(s))).toFixed(0)}px`);
    set('--ky', `${(-160 + 90 * Math.cos(s * 0.7)).toFixed(0)}px`);
  };
  const frame = (now: number) => {
    raf = 0;
    let busy = false;
    // Spring towards the pointer: a soft, slightly overshooting follow.
    if (x < -1000) { x = tx; y = ty; }
    const ax = (tx - x) * 0.14, ay = (ty - y) * 0.14;
    vx = (vx + ax) * 0.74;
    vy = (vy + ay) * 0.74;
    x += vx;
    y += vy;
    if (Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) + Math.abs(vy) > 0.5) busy = true;
    set('--lx', `${x.toFixed(1)}px`);
    set('--ly', `${y.toFixed(1)}px`);
    // Opening ripple.
    if (waveStart) {
      const t = (now - waveStart) / 1100;
      if (t >= 1) {
        waveStart = 0;
        set('--wr', '-200px');
      } else {
        const e = 1 - Math.pow(1 - t, 3);
        set('--wr', `${(e * 1400).toFixed(0)}px`);
        set('--wa', `${(1 - t).toFixed(2)}`);
        busy = true;
      }
    }
    if (busy) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const point = (px: number, py: number) => {
    tx = px;
    ty = py;
    kick();
  };

  window.addEventListener('mousemove', (e: MouseEvent) => point(e.clientX, e.clientY), { passive: true });
  document.addEventListener('scroll', (e) => {
    const t = e.target as HTMLElement;
    if (t?.classList?.contains('grid-wrap') || t?.classList?.contains('results')) innerScroll = t.scrollTop;
    key();
  }, { capture: true, passive: true });
  window.addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const d = e.data as { diarc?: string; x?: number; y?: number; luma?: number };
    if (d?.diarc === 'pointer') point(d.x!, d.y!);
    else if (d?.diarc === 'scroll') { pageScroll = d.y!; key(); }
    else if (d?.diarc === 'backdrop') html.dataset.backdrop = d.luma! > 0.55 ? 'light' : 'dark';
  });
  window.addEventListener('resize', key);
  key();
  set('--wr', '-200px');

  return {
    wave() {
      const bar = document.querySelector('.bar')?.getBoundingClientRect();
      if (bar) {
        set('--wx', `${(bar.left + bar.width / 2).toFixed(0)}px`);
        set('--wy', `${(bar.top + bar.height / 2).toFixed(0)}px`);
      }
      waveStart = performance.now();
      kick();
    },
  };
}
