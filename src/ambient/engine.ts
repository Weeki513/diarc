/**
 * Ambient ASCII creatures: a cell-grid renderer on one canvas.
 *
 * Everything snaps to a grid of square cells. Creatures are pixel sprites rotated on that grid
 * (nearest-cell sampling, so they stay crisp and blocky), and leave fading character trails.
 * Cheap by design: one canvas, capped FPS, typed-array trail buffer, stops when hidden.
 */
import type { AmbientSettings } from '../shared/storage';
import { DEFAULT_AMBIENT } from '../shared/storage';
import { paletteFrom, type CreatureDefinition, type Sprite } from './api';
import { creatureIds, creatures } from './registry';

interface Agent {
  sp: CreatureDefinition;
  pal: string[];
  x: number; // in cells
  y: number;
  vx: number;
  vy: number;
  angle: number;
  spin: number;
  scale: number;
  phase: number;
  wander: number;
  emit: number;
}

export class Ambient {
  private ctx: CanvasRenderingContext2D;
  private s: AmbientSettings = DEFAULT_AMBIENT;
  private agents: Agent[] = [];
  private cols = 0;
  private rows = 0;
  private dpr = 1;
  private trailI = new Float32Array(0);
  private trailC = new Uint8Array(0);
  private trailK: string[] = [];
  private trailChars: string[] = [];
  private colorIdx = new Map<string, number>();
  private raf = 0;
  private last = 0;
  private running = false;
  private mouse = { x: -1e4, y: -1e4, active: false };
  private t0 = performance.now();

  constructor(private canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    new ResizeObserver(() => this.resize()).observe(canvas);
    document.addEventListener('visibilitychange', () => (document.hidden ? this.stop() : this.running && this.loop()));
  }

  configure(s: Partial<AmbientSettings>): void {
    const prev = this.s;
    this.s = { ...DEFAULT_AMBIENT, ...s };
    this.canvas.style.opacity = String(this.s.opacity);
    this.canvas.style.backgroundImage = this.s.grid ? this.gridImage() : 'none';
    const reseed = prev.species !== this.s.species || prev.count !== this.s.count || prev.color !== this.s.color || prev.cell !== this.s.cell || !this.agents.length;
    if (prev.cell !== this.s.cell) this.resize();
    if (reseed) this.seed();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (document.hidden) return;
    this.running = false;
  }

  /** Pointer in canvas CSS pixels. */
  pointer(x: number, y: number): void {
    this.mouse = { x: x / this.s.cell, y: y / this.s.cell, active: true };
  }

  pointerLeave(): void {
    this.mouse.active = false;
  }

  /** Click: everything nearby bursts away. */
  scatter(x: number, y: number): void {
    const cx = x / this.s.cell, cy = y / this.s.cell;
    for (const a of this.agents) {
      const dx = a.x - cx, dy = a.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      if (d > 40) continue;
      const f = (1 - d / 40) * 2.2;
      a.vx += (dx / d) * f;
      a.vy += (dy / d) * f;
      a.spin += (Math.random() - 0.5) * 0.4;
    }
  }

  // ---- setup ----

  private resize(): void {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    const cols = Math.ceil(r.width / this.s.cell), rows = Math.ceil(r.height / this.s.cell);
    if (cols !== this.cols || rows !== this.rows) {
      this.cols = cols;
      this.rows = rows;
      this.trailI = new Float32Array(cols * rows);
      this.trailC = new Uint8Array(cols * rows);
    }
    if (!this.running) this.draw(performance.now());
  }

  private gridImage(): string {
    const c = document.createElement('canvas');
    const n = this.s.cell * 2;
    c.width = c.height = n;
    const g = c.getContext('2d')!;
    g.fillStyle = 'rgba(160,170,190,0.16)';
    g.fillRect(0, 0, 1, 1);
    g.fillStyle = 'rgba(160,170,190,0.07)';
    g.fillRect(this.s.cell, 0, 1, 1);
    g.fillRect(0, this.s.cell, 1, 1);
    return `url(${c.toDataURL()})`;
  }

  private seed(): void {
    const all = creatureIds();
    const ids = this.s.species === 'mix' || !creatures.has(this.s.species) ? all : [this.s.species];
    this.trailK = [];
    this.colorIdx.clear();
    this.trailChars = [];
    this.agents = Array.from({ length: Math.max(1, Math.min(120, this.s.count)) }, (_, i) => {
      const sp = creatures.get(ids[i % ids.length])!;
      const pal = this.s.color ? paletteFrom(this.s.color) : sp.palette;
      const ang = Math.random() * Math.PI * 2;
      return {
        sp,
        pal,
        x: Math.random() * Math.max(this.cols, 10),
        y: this.spawnY(),
        vx: Math.cos(ang) * sp.speed,
        vy: Math.sin(ang) * sp.speed,
        angle: ang,
        spin: sp.fall ? (Math.random() - 0.5) * 0.08 : 0,
        scale: (sp.sizes ?? [1])[Math.floor(Math.random() * (sp.sizes ?? [1]).length)],
        phase: Math.random(),
        wander: Math.random() * 1000,
        emit: 0,
      };
    });
    if (this.cols) this.trailI.fill(0);
  }

  private spawnY(): number {
    const rows = Math.max(this.rows, 10);
    if (this.s.area === 'bottom') return rows * (0.66 + Math.random() * 0.34);
    return Math.random() * rows;
  }

  private colorId(c: string): number {
    let i = this.colorIdx.get(c);
    if (i === undefined) {
      i = this.trailK.push(c) - 1;
      this.colorIdx.set(c, i);
    }
    return i;
  }

  private charId(ch: string): number {
    let i = this.trailChars.indexOf(ch);
    if (i < 0) i = this.trailChars.push(ch) - 1;
    return i;
  }

  // ---- simulation ----

  private loop = (): void => {
    this.raf = requestAnimationFrame((now) => {
      if (!this.running) return;
      const minDt = 1000 / this.s.fps - 2;
      if (now - this.last >= minDt) {
        const dt = Math.min(3, (now - this.last) / (1000 / 60));
        this.last = now;
        this.step(dt);
        this.draw(now);
      }
      this.loop();
    });
  };

  private step(dt: number): void {
    const s = this.s, cols = this.cols, rows = this.rows;
    const speedK = s.speed * dt;
    const top = s.area === 'bottom' ? rows * 0.62 : 0;
    for (const a of this.agents) {
      const sp = a.sp;
      a.wander += 0.01 * dt;
      // Wander: a slowly changing heading.
      const want = sp.fall
        ? Math.PI / 2 + Math.sin(a.wander * 3 + a.phase * 9) * 0.9
        : Math.atan2(a.vy, a.vx) + Math.sin(a.wander * 2.3 + a.phase * 20) * sp.turn * 30;
      let ax = Math.cos(want) * sp.turn * 2, ay = Math.sin(want) * sp.turn * 2;

      if (sp.flock) {
        let cx = 0, cy = 0, vx = 0, vy = 0, sx = 0, sy = 0, n = 0;
        for (const b of this.agents) {
          if (b === a || b.sp !== sp) continue;
          const dx = b.x - a.x, dy = b.y - a.y, d2 = dx * dx + dy * dy;
          if (d2 > 400) continue;
          n++;
          cx += dx; cy += dy; vx += b.vx; vy += b.vy;
          if (d2 < 30) { sx -= dx / (d2 + 1); sy -= dy / (d2 + 1); }
        }
        if (n) {
          ax += (cx / n) * 0.002 + (vx / n - a.vx) * 0.04 + sx * 0.6;
          ay += (cy / n) * 0.002 + (vy / n - a.vy) * 0.04 + sy * 0.6;
        }
      }

      if (this.mouse.active && s.cursor !== 'none') {
        const dx = a.x - this.mouse.x, dy = a.y - this.mouse.y, d = Math.hypot(dx, dy) || 1;
        const R = 14;
        if (s.cursor === 'flee' && d < R) {
          const f = (1 - d / R) * 0.35;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
        } else if (s.cursor === 'follow' && d < 60 && d > 4) {
          ax -= (dx / d) * 0.02;
          ay -= (dy / d) * 0.02;
        }
      }

      // Edges: "edges" keeps them near the sides, others wrap around.
      if (s.area === 'edges') {
        const mid = cols / 2, band = cols * 0.18;
        const distSide = Math.min(a.x, cols - a.x);
        if (distSide > band) ax += (a.x < mid ? -1 : 1) * 0.01;
      }
      if (a.y < top + 2) ay += 0.02;

      a.vx += ax * dt;
      a.vy += ay * dt;
      // Keep each species near its cruising speed.
      const v = Math.hypot(a.vx, a.vy) || 1;
      const target = sp.speed * (sp.fall ? 0.7 : 1);
      const k = 1 + (target / v - 1) * 0.04 * dt;
      a.vx *= k;
      a.vy *= k;
      a.x += a.vx * speedK * 0.35;
      a.y += a.vy * speedK * 0.35;

      const m = 8;
      if (a.x < -m) a.x = cols + m;
      if (a.x > cols + m) a.x = -m;
      if (a.y < top - m) a.y = rows + m;
      if (a.y > rows + m) { a.y = sp.fall ? top - m : top - m; if (sp.fall) a.x = Math.random() * cols; }

      if (sp.fall) a.angle += (a.spin + Math.sin(a.wander * 4) * 0.02) * dt;
      else {
        // Turn smoothly towards the direction of travel.
        const head = Math.atan2(a.vy, a.vx);
        let d = head - a.angle;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        a.angle += d * 0.12 * dt;
      }
      a.phase = (a.phase + (sp.fps / 60) * dt * Math.max(0.3, s.speed) / sp.frames.length) % 1;

      // Trail.
      if (s.trail > 0) {
        a.emit += dt * s.speed;
        if (a.emit >= 2.5) {
          a.emit = 0;
          const [tx, ty] = a.sp.frames[0].tail;
          const cos = Math.cos(a.angle), sin = Math.sin(a.angle);
          const px = Math.round(a.x + (tx * cos - ty * sin) * a.scale);
          const py = Math.round(a.y + (tx * sin + ty * cos) * a.scale);
          this.deposit(px, py, a);
        }
      }
    }

    // Fade trails; bubbles drift upwards.
    if (s.trail > 0) {
      const decay = Math.pow(0.5, dt / Math.max(2, s.trail * 0.5));
      const I = this.trailI;
      for (let i = 0; i < I.length; i++) if (I[i] > 0) I[i] = I[i] < 0.04 ? 0 : I[i] * decay;
    }
  }

  private deposit(x: number, y: number, a: Agent): void {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return;
    const chars = this.s.chars || a.sp.trailChars;
    const ch = chars[Math.floor(Math.random() * chars.length)] ?? '·';
    const i = y * this.cols + x;
    this.trailI[i] = 1;
    this.trailC[i] = this.charId(ch);
    this.trailOwner[i] = this.colorId(a.pal[a.sp.trailColor - 1] ?? a.pal[2]);
  }
  private trailOwner = new Uint8Array(0);

  // ---- drawing ----

  private draw(now: number): void {
    const { ctx, dpr } = this;
    const cell = this.s.cell;
    if (this.trailOwner.length !== this.trailI.length) this.trailOwner = new Uint8Array(this.trailI.length);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width / dpr, this.canvas.height / dpr);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.round(cell * 1.05)}px ui-monospace, SFMono-Regular, Menlo, monospace`;

    // Trails.
    if (this.s.trail > 0) {
      const I = this.trailI, C = this.trailC, K = this.trailOwner, cols = this.cols;
      for (let i = 0; i < I.length; i++) {
        const v = I[i];
        if (!v) continue;
        ctx.globalAlpha = Math.min(1, v * 0.9);
        ctx.fillStyle = this.trailK[K[i]] ?? '#888';
        ctx.fillText(this.trailChars[C[i]] ?? '·', (i % cols) * cell + cell / 2, Math.floor(i / cols) * cell + cell / 2);
      }
      ctx.globalAlpha = 1;
    }

    const t = (now - this.t0) / 1000;
    for (const a of this.agents) this.drawAgent(a, t);
  }

  private drawAgent(a: Agent, t: number): void {
    const { ctx } = this;
    const cell = this.s.cell;
    const sp = a.sp;
    const fr: Sprite = sp.frames[Math.floor(a.phase * sp.frames.length) % sp.frames.length];
    const cos = Math.cos(-a.angle), sin = Math.sin(-a.angle);
    const scale = a.scale;
    const R = Math.ceil((Math.hypot(fr.w, fr.h) / 2) * scale) + 1;
    // Pixels stay on the creature's own grid, but the whole creature moves smoothly (sub-cell).
    const cx = a.x, cy = a.y;
    const gap = cell >= 7 ? 1 : 0;

    if (sp.glow) {
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.4 + a.wander * 7 + a.x * 0.05);
      const g = this.glow(a.pal[3]);
      const size = cell * 9 * (0.8 + pulse * 0.4);
      ctx.globalAlpha = 0.35 + 0.5 * pulse;
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(g, cx * cell + cell / 2 - size / 2, cy * cell + cell / 2 - size / 2, size, size);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
    }

    for (let j = -R; j <= R; j++) {
      for (let i = -R; i <= R; i++) {
        // Inverse-rotate the target cell into sprite space (nearest neighbour = crisp pixels).
        const u = (i * cos - j * sin) / scale + fr.w / 2 + 0.001;
        const v = (i * sin + j * cos) / scale + fr.h / 2;
        const ux = Math.floor(u), vy = Math.floor(v);
        if (ux < 0 || vy < 0 || ux >= fr.w || vy >= fr.h) continue;
        const k = vy * fr.w + ux;
        const c = fr.c[k];
        if (!c) continue;
        const px = Math.round((cx + i) * cell), py = Math.round((cy + j) * cell);
        const glyph = fr.g[k];
        if (glyph) {
          ctx.fillStyle = a.pal[c - 1];
          ctx.fillText(glyph, px + cell / 2, py + cell / 2);
        } else {
          ctx.fillStyle = a.pal[c - 1];
          ctx.fillRect(px, py, cell - gap, cell - gap);
        }
      }
    }
  }

  private glowCache = new Map<string, HTMLCanvasElement>();
  private glow(color: string): HTMLCanvasElement {
    let g = this.glowCache.get(color);
    if (g) return g;
    g = document.createElement('canvas');
    g.width = g.height = 64;
    const x = g.getContext('2d')!;
    const grad = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'transparent');
    x.fillStyle = grad;
    x.fillRect(0, 0, 64, 64);
    this.glowCache.set(color, g);
    return g;
  }
}
