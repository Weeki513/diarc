/**
 * Creature API for the ambient layer (see docs/CREATURES.md).
 *
 * A creature is a small pixel sprite on a grid of square cells, animated by frames, plus a few
 * numbers that describe how it moves. Draw frames either with `fromAscii` (ASCII art, easiest)
 * or procedurally with `canvas` (a tiny cell grid). Sprites face right (+x); the engine rotates
 * them to the direction of travel.
 */

export interface Sprite {
  w: number;
  h: number;
  /** Palette index per cell, row-major: 0 = empty, 1–4 = palette shades (1 darkest). */
  c: Uint8Array;
  /** Optional character drawn in a cell instead of a filled square (eyes, fins, veins). */
  g: (string | undefined)[];
  /** Where the trail comes out, relative to the sprite centre, in cells. */
  tail: [number, number];
}

export interface CreatureDefinition {
  /** Kebab-case, must match the file name in src/ambient/creatures/. */
  id: string;
  /** Shown in settings, Russian. */
  name: string;
  /** Natural colours, darkest → brightest. Users can override with one colour of their own. */
  palette: [string, string, string, string];
  frames: Sprite[];
  /** Animation frames per second at speed 1. Keep it low (3–10): calm, not twitchy. */
  fps: number;
  /** Cruising speed, ~0.3 (drifting) … 1.6 (fast flyer). */
  speed: number;
  /** How quickly it changes direction, ~0.01 (gliding) … 0.06 (fluttery). */
  turn: number;
  /** Characters for the fading trail, and which palette shade (1–4) colours it. */
  trailChars: string;
  trailColor: 1 | 2 | 3 | 4;
  /** Flocks with others of its kind (boids). */
  flock?: boolean;
  /** Falls and spins instead of swimming. */
  fall?: boolean;
  /** Soft pulsing light around it. */
  glow?: boolean;
  /** Size variants picked at random (1 = sprite size). */
  sizes?: number[];
}

export function defineCreature(def: CreatureDefinition): CreatureDefinition {
  return { sizes: [1], ...def };
}

/** A blank sprite to draw into procedurally. */
export function canvas(w: number, h: number, tail: [number, number] = [-w / 2, 0]) {
  const c = new Uint8Array(w * h);
  const g: (string | undefined)[] = new Array(w * h);
  const set = (x: number, y: number, v: number, ch?: string) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    c[y * w + x] = v;
    if (ch) g[y * w + x] = ch;
  };
  const sprite = (): Sprite => ({ w, h, c, g, tail });
  return { set, sprite };
}

/**
 * Sprite from ASCII art. In `lines`, `.` or space = empty, `1`–`4` = palette shade; any other
 * character is drawn as that character in the colour given by `glyphShade` (default 4).
 *
 *   fromAscii([
 *     '..11...',
 *     '.1223o>',
 *     '..11...',
 *   ])
 */
export function fromAscii(lines: string[], opts: { glyphShade?: number; tail?: [number, number] } = {}): Sprite {
  const h = lines.length;
  const w = Math.max(...lines.map((l) => [...l].length));
  const { set, sprite } = canvas(w, h, opts.tail ?? [-w / 2, 0]);
  lines.forEach((line, y) =>
    [...line].forEach((ch, x) => {
      if (ch === '.' || ch === ' ') return;
      if (ch >= '1' && ch <= '4') set(x, y, +ch);
      else set(x, y, opts.glyphShade ?? 4, ch);
    }),
  );
  return sprite();
}

/** n frames of a procedural animation, t = 0 … 1. */
export const frames = (fn: (t: number) => Sprite, n: number): Sprite[] => Array.from({ length: n }, (_, i) => fn(i / n));

/** Four shades from one colour, for the "own colour" option. */
export function paletteFrom(hex: string): [string, string, string, string] {
  const n = parseInt(hex.replace('#', ''), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const mix = (k: number, to: number) => `rgb(${[r, g, b].map((v) => Math.round(v + (to - v) * k)).join(',')})`;
  return [mix(0.55, 0), mix(0.2, 0), hex, mix(0.6, 255)];
}
