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
