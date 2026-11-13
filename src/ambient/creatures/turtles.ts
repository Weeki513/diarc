/** Sea turtle: patterned shell, paddling flippers, slow and calm. */
import { canvas, defineCreature, frames, type Sprite } from '../api';

function turtle(t: number): Sprite {
  const w = 14, h = 13, cx = 6, cy = 6;
  const { set, sprite } = canvas(w, h, [-6, 0]);
  for (let y = -3; y <= 3; y++)
    for (let x = -4; x <= 4; x++) {
      if ((x * x) / 20 + (y * y) / 11 > 1) continue;
      const plate = (Math.abs(x) + Math.abs(y)) % 3 === 0 ? 3 : 2;
      set(cx + x, cy + y, Math.abs(y) === 3 || Math.abs(x) >= 4 ? 1 : plate);
    }
  set(cx + 5, cy, 3); set(cx + 6, cy, 3); set(cx + 6, cy - 1, 4, '°');
  const s = Math.sin(t * Math.PI * 2);
  const fr = Math.round(1.5 * s);
  for (let i = 1; i <= 3; i++) {
    set(cx + 2 + fr - i + 1, cy - 3 - i, 3);
    set(cx + 2 + fr - i + 1, cy + 3 + i, 3);
  }
  set(cx - 4 - Math.round(s), cy - 3, 3); set(cx - 4 - Math.round(s), cy + 3, 3);
  set(cx - 5, cy, 1, '~');
  return sprite();
}
export default defineCreature({ id: 'turtles', name: 'Черепахи', palette: ['#2f3d22', '#5d7a37', '#8db34f', '#e8f0c2'], trailChars: 'o°·', trailColor: 4, frames: frames(turtle, 8), fps: 3, speed: 0.35, turn: 0.01, sizes: [1, 1.3] });
