/** Swallow: forked tail, swept wings, white belly, rusty throat. Flies in flocks. */
import { canvas, defineCreature, frames, type Sprite } from '../api';

function swallow(t: number): Sprite {
  const w = 13, h = 13, cy = 6;
  const { set, sprite } = canvas(w, h, [-5, 0]);
  for (let x = 3; x <= 9; x++) set(x, cy, x >= 8 ? 1 : 4); // body: dark back, white belly
  set(8, cy - 1, 1); set(9, cy - 1, 1); set(10, cy, 3); set(10, cy - 1, 1); set(11, cy, 1); // head, rusty throat
  const reach = Math.round(4 + 1.6 * Math.sin(t * Math.PI * 2));
  for (let i = 1; i <= reach; i++) {
    // Wings swept back at ~45°, two cells thick near the body.
    set(7 - i, cy - i, i === reach ? 1 : 2); set(7 - i, cy + i, i === reach ? 1 : 2);
    set(8 - i, cy - i, 1); set(8 - i, cy + i, 1);
  }
  set(2, cy - 1, 1); set(1, cy - 2, 1); set(2, cy + 1, 1); set(1, cy + 2, 1); // forked tail
  return sprite();
}

export default defineCreature({ id: 'swallows', name: 'Ласточки', palette: ['#141a3a', '#2a3d7c', '#c4572f', '#eef1f8'], trailChars: "'`,", trailColor: 1, frames: frames(swallow, 6), fps: 7, speed: 1.2, turn: 0.04, flock: true });
