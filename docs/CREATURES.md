# Creatures: how to add your own

The ambient layer ("Существа") draws small pixel creatures that swim over pages under the bar's
glass, and in the «Аквариум» tab. Every creature is one file in `src/ambient/creatures/`. Files are
picked up automatically at build time (`import.meta.glob`), so there is no list to edit.

## Quick start

```sh
npm run new-creature -- koi-moth "Мотыльки"   # creates src/ambient/creatures/koi-moth.ts
npm run typecheck && npm run build              # then reload the extension
```

Pick it in **Настройки → Существа**, or in the picker at the top of the «Аквариум» tab.

## The contract

```ts
import { defineCreature, fromAscii, canvas, frames } from '../api';

export default defineCreature({
  id: 'koi-moth',           // must equal the file name
  name: 'Мотыльки',         // shown in settings (Russian)
  palette: ['#1d1a2e', '#4b3f7a', '#9a86d9', '#efe9ff'], // shades 1–4, darkest first
  frames: [A, B],           // sprites, see below
  fps: 4,                   // animation frames per second at speed 1 (keep 2–10)
  speed: 0.5,               // cruising speed: 0.3 drifting … 1.6 fast flyer
  turn: 0.02,               // how fast it changes direction: 0.01 gliding … 0.06 fluttery
  trailChars: '·~',         // characters of the fading trail
  trailColor: 2,            // palette shade of the trail
  flock: false,             // optional: flies in flocks (boids)
  fall: false,              // optional: falls and spins (like leaves)
  glow: false,              // optional: soft pulsing light (like fireflies)
  sizes: [1, 1.3],          // optional: size variants picked at random
});
```

### Sprites

A sprite is a small grid of cells. **It faces right (+x)**; the engine rotates it toward the
direction of travel, snapping to the cell grid so it stays crisp.

The easiest way is ASCII art with `fromAscii`:

```ts
const A = fromAscii([
  '...11....',
  '..1222...',
  '1122334o.',   // 'o' is drawn as a character (an eye) in shade 4
  '..1222...',
  '...11....',
]);
```

- `.` or space: empty
- `1`–`4`: a filled cell in that palette shade (1 darkest)
- any other character: drawn as text in shade 4 (or `{ glyphShade: n }`)
- `{ tail: [x, y] }`: where the trail comes out, relative to the centre (default: the back edge)

For smooth shapes, draw procedurally with `canvas(w, h)` and make frames with `frames(fn, n)`:

```ts
function body(t: number) {             // t goes 0 → 1 over the animation
  const { set, sprite } = canvas(12, 9);
  const flap = Math.sin(t * Math.PI * 2);
  for (let x = 0; x < 10; x++) set(x, 4, x > 7 ? 1 : 3);
  set(6, 4 - Math.round(2 + flap), 2);  // set(x, y, shade, char?)
  return sprite();
}
export default defineCreature({ ..., frames: frames(body, 8) });
```

## Style rules (keep it calm)

- **Unobtrusive.** Slow speed, low fps (2–8), small sprites (5–16 cells). Users read pages under them.
- **Smooth.** Movement is continuous; animate with 4–10 frames and gentle changes between them.
- **Readable silhouettes.** Use shade 1 for outlines/edges, 2–3 for the body, 4 for highlights and eyes.
- **Original.** Draw your own creatures; don't copy sprites from other projects.
- Look at `manta.ts` (procedural), `turtles.ts` (pattern + paddling) and `fireflies.ts` (tiny + glow).

## How it runs (for reference)

- `src/ambient/engine.ts` — one canvas, cell grid, rotation by nearest-cell sampling, trail buffer
  in typed arrays, FPS cap, stops when the tab is hidden.
- `src/pages/ambient.html` + `src/ambient/main.ts` — `?mode=tab` is the «Аквариум» tab; default is the
  click-through overlay the content script puts over sites (under the bar's glass, so the glass refracts it).
- Settings live in `settings.ambient` (`src/shared/storage.ts`, `AmbientSettings`).
