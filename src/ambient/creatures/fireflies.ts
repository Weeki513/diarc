/** Firefly: tiny body, flickering wings, a lantern that glows. */
import { canvas, defineCreature, frames, type Sprite } from '../api';

function firefly(t: number): Sprite {
  const w = 5, h = 5;
  const { set, sprite } = canvas(w, h, [-2, 0]);
  set(3, 2, 1); set(2, 2, 2); set(1, 2, 4); // head, thorax, lantern
  const up = t < 0.5;
  set(2, up ? 1 : 0, 1, up ? '\\' : '`');
  set(2, up ? 3 : 4, 1, up ? '/' : ',');
  set(4, 2, 1, '.');
  return sprite();
}
export default defineCreature({ id: 'fireflies', name: 'Светлячки', palette: ['#3a3418', '#6b5d22', '#c9b44a', '#fff27a'], trailChars: '·.˙', trailColor: 4, frames: frames(firefly, 2), fps: 8, speed: 0.45, turn: 0.04, glow: true });
