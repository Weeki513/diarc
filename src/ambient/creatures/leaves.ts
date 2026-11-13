/** Autumn leaf: falls, sways and slowly spins. */
import { canvas, defineCreature, frames, type Sprite } from '../api';

function leaf(t: number): Sprite {
  const w = 9, h = 7, cy = 3;
  const { set, sprite } = canvas(w, h, [-4, 0]);
  const curl = Math.round(Math.sin(t * Math.PI * 2));
  for (let x = 1; x <= 7; x++) {
    const k = (x - 1) / 6;
    const half = Math.round(3 * Math.sin(Math.PI * Math.pow(k, 0.8)));
    for (let dy = -half; dy <= half; dy++) set(x, cy + dy, dy === 0 ? 3 : Math.abs(dy) === half ? 1 : 2);
  }
  set(0, cy, 1, '\'');
  for (let x = 2; x <= 6; x += 2) { set(x, cy - 1, 3, '/'); set(x, cy + 1, 3, '\\'); }
  set(7, cy + curl, 4);
  return sprite();
}
export default defineCreature({ id: 'leaves', name: 'Листья', palette: ['#6b2412', '#c4521c', '#f0a234', '#ffe08a'], trailChars: ',.`', trailColor: 2, frames: frames(leaf, 4), fps: 2, speed: 0.5, turn: 0.03, fall: true, sizes: [1, 0.8, 1.2] });
