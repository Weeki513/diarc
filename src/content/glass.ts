/**
 * Liquid glass under the bar.
 *
 * The bar's UI lives in an extension iframe, and backdrop-filter inside an iframe can only see the
 * iframe's own (transparent) document, never the page. So the glass itself is drawn here, in the
 * page's shadow root, right under the iframe: the iframe reports where its glass pieces are
 * (search pill, tiles, footer) and we place "plates" there whose backdrop-filter refracts the page.
 *
 * Each plate's filter is an SVG chain: light blur → displacement through a per-size lens map
 * (content bends near the rounded edges, like a convex lens) → split RGB displacement for a faint
 * chromatic fringe → saturation boost. Maps are generated once per plate size and cached.
 * The iframe draws the tint, rim light and shadows on top.
 */

export type GlassMode = 'liquid' | 'frost' | 'off';

export interface GlassRect { x: number; y: number; w: number; h: number; r: number; c?: 0 | 1 }
export interface GlassMsg { plates: GlassRect[]; clip: { x: number; y: number; w: number; h: number } | null }

const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_FILTERS = 40;

export const GLASS_CSS = `
  .glass-layer { position: absolute; inset: 0; pointer-events: none; }
  .glass-layer.anim .plate, .glass-layer.anim .haze { animation: glass-in .12s ease-out; }
  @keyframes glass-in { from { opacity: 0; } }
  .plate { position: absolute; left: 0; top: 0; will-change: transform; }
  .glass-clip { position: absolute; overflow: hidden; }
  .haze { position: absolute; backdrop-filter: blur(2.5px) saturate(1.1);
    -webkit-mask: linear-gradient(90deg, transparent, #000 36px, #000 calc(100% - 36px), transparent),
                  linear-gradient(180deg, transparent, #000 36px, #000 calc(100% - 36px), transparent);
    -webkit-mask-composite: source-in; mask-composite: intersect; }
`;

/** Lens map: R/G hold the x/y displacement (128 = none) for a rounded rect of w×h, radius r. */
function lensMap(w: number, h: number, r: number): string {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const px32 = new Uint32Array(img.data.buffer);
  px32.fill(0xff808080); // ABGR little-endian: neutral grey, opaque
  const bezel = Math.max(6, Math.min(34, r * 1.4, h / 2.2, w / 2.2));
  const hw = w / 2, hh = h / 2;
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const py = y + 0.5 - hh;
    const qy = Math.abs(py) - (hh - r);
    for (let x = 0; x < w; x++) {
      const px = x + 0.5 - hw;
      const qx = Math.abs(px) - (hw - r);
      // Quick reject: far from every edge.
      if (qx < -bezel - r && qy < -bezel - r) continue;
      const ox = qx > 0 ? qx : 0, oy = qy > 0 ? qy : 0;
      const outside = Math.sqrt(ox * ox + oy * oy);
      const depth = -(outside + Math.min(Math.max(qx, qy), 0) - r); // distance inside the edge
      if (depth < 0 || depth >= bezel) continue;
      let nx: number, ny: number;
      if (outside > 0) { nx = ox / outside; ny = oy / outside; }
      else if (qx > qy) { nx = 1; ny = 0; }
      else { nx = 0; ny = 1; }
      if (px < 0) nx = -nx;
      if (py < 0) ny = -ny;
      // Convex squircle-ish profile: strongest right at the rim, fading smoothly inward.
      const t = 1 - depth / bezel;
      const m = t * t * (3 - 2 * t) * t;
      const i = (y * w + x) * 4;
      d[i] = 128 - nx * m * 127;
      d[i + 1] = 128 - ny * m * 127;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}

export class GlassLayer {
  readonly el: HTMLDivElement;
  private haze: HTMLDivElement;
  private clip: HTMLDivElement;
  private svg: SVGSVGElement;
  private defs = new Map<string, SVGFilterElement>();
  private pool: HTMLDivElement[] = [];
  private seq = 0;

  constructor(root: ShadowRoot, private mode: GlassMode) {
    this.svg = document.createElementNS(SVG_NS, 'svg');
    this.svg.setAttribute('width', '0');
    this.svg.setAttribute('height', '0');
    this.svg.style.position = 'absolute';
    this.el = document.createElement('div');
    this.el.className = 'glass-layer';
    this.haze = document.createElement('div');
    this.haze.className = 'haze';
    this.clip = document.createElement('div');
    this.clip.className = 'glass-clip';
    this.el.append(this.svg, this.haze, this.clip);
    root.append(this.el);
  }

  setMode(mode: GlassMode): void {
    this.mode = mode;
    if (mode === 'off') this.clear();
  }

  /** Replays the fade-in when the bar opens. */
  flash(): void {
    this.el.classList.remove('anim');
    void this.el.offsetWidth;
    this.el.classList.add('anim');
  }

  clear(): void {
    for (const p of this.pool) p.style.display = 'none';
    this.haze.style.display = 'none';
  }

  /** origin: the iframe's position in the page viewport; rects are in iframe coordinates. */
  update(msg: GlassMsg, origin: { x: number; y: number }): void {
    if (this.mode === 'off') return this.clear();
    const { plates, clip } = msg;
    const used = new Set<string>();
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    if (clip) {
      Object.assign(this.clip.style, {
        display: 'block',
        left: `${origin.x + clip.x}px`, top: `${origin.y + clip.y}px`,
        width: `${clip.w}px`, height: `${clip.h}px`,
      });
    } else this.clip.style.display = 'none';

    plates.forEach((p, i) => {
      let el = this.pool[i];
      if (!el) {
        el = document.createElement('div');
        el.className = 'plate';
        this.pool.push(el);
      }
      const parent = p.c && clip ? this.clip : this.el;
      if (el.parentNode !== parent) parent.append(el);
      const w = Math.round(p.w), h = Math.round(p.h), r = Math.round(p.r);
      const x = p.c && clip ? p.x - clip.x : origin.x + p.x;
      const y = p.c && clip ? p.y - clip.y : origin.y + p.y;
      el.style.display = 'block';
      el.style.width = `${w}px`;
      el.style.height = `${h}px`;
      el.style.borderRadius = `${r}px`;
      el.style.transform = `translate(${x}px, ${y}px)`;
      if (this.mode === 'liquid') {
        const id = this.filter(w, h, r);
        used.add(id);
        el.style.backdropFilter = `url(#${id})`;
      } else el.style.backdropFilter = 'blur(14px) saturate(1.7)';

      // Haze area: everything the bar covers on screen (clipped plates count only where visible).
      const vx = origin.x + p.x, vy = origin.y + p.y;
      const top = p.c && clip ? Math.max(vy, origin.y + clip.y) : vy;
      const bottom = p.c && clip ? Math.min(vy + h, origin.y + clip.y + clip.h) : vy + h;
      if (bottom > top) {
        minX = Math.min(minX, vx); maxX = Math.max(maxX, vx + w);
        minY = Math.min(minY, top); maxY = Math.max(maxY, bottom);
      }
    });
    for (let i = plates.length; i < this.pool.length; i++) this.pool[i].style.display = 'none';

    if (minX < maxX) {
      const pad = 28;
      Object.assign(this.haze.style, {
        display: 'block',
        left: `${minX - pad}px`, top: `${minY - pad}px`,
        width: `${maxX - minX + pad * 2}px`, height: `${maxY - minY + pad * 2}px`,
      });
    } else this.haze.style.display = 'none';

    this.prune(used);
  }

  private filter(w: number, h: number, r: number): string {
    const key = `${w}x${h}r${r}`;
    const hit = this.defs.get(key);
    if (hit) return hit.id;
    const id = `lg${++this.seq}`;
    const f = document.createElementNS(SVG_NS, 'filter');
    f.id = id;
    for (const [k, v] of Object.entries({ x: '0', y: '0', width: `${w}`, height: `${h}`, filterUnits: 'userSpaceOnUse', 'color-interpolation-filters': 'sRGB' })) f.setAttribute(k, v);
    const scale = Math.min(110, Math.max(34, Math.min(w, h) * 0.65));
    // Keep one colour channel of a displaced copy; opaque, so the arithmetic sum keeps all three.
    const channel = (c: 0 | 1 | 2) => {
      const rows = [0, 1, 2].map((k) => (k === c ? ['1 0 0 0 0', '0 1 0 0 0', '0 0 1 0 0'][k] : '0 0 0 0 0'));
      return [...rows, '0 0 0 0 1'].join(' ');
    };
    f.innerHTML = `
      <feGaussianBlur in="SourceGraphic" stdDeviation="1.1" edgeMode="duplicate" result="b"/>
      <feImage href="${lensMap(w, h, r)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="m"/>
      <feDisplacementMap in="b" in2="m" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="dr"/>
      <feDisplacementMap in="b" in2="m" scale="${scale * 0.84}" xChannelSelector="R" yChannelSelector="G" result="dg"/>
      <feDisplacementMap in="b" in2="m" scale="${scale * 0.68}" xChannelSelector="R" yChannelSelector="G" result="db"/>
      <feColorMatrix in="dr" type="matrix" values="${channel(0)}" result="r"/>
      <feColorMatrix in="dg" type="matrix" values="${channel(1)}" result="g"/>
      <feColorMatrix in="db" type="matrix" values="${channel(2)}" result="bl"/>
      <feComposite in="r" in2="g" operator="arithmetic" k2="1" k3="1" result="rg"/>
      <feComposite in="rg" in2="bl" operator="arithmetic" k2="1" k3="1" result="rgb"/>
      <feColorMatrix in="rgb" type="saturate" values="1.45"/>`;
    this.svg.append(f);
    this.defs.set(key, f);
    return id;
  }

  private prune(used: Set<string>): void {
    if (this.defs.size <= MAX_FILTERS) return;
    for (const [key, f] of this.defs) {
      if (this.defs.size <= MAX_FILTERS) break;
      if (used.has(f.id)) continue;
      f.remove();
      this.defs.delete(key);
    }
  }
}
