/** Manta ray: broad wings that beat slowly, pale belly line, cephalic fins and a whip tail. */
import { canvas, defineCreature, frames, type Sprite } from '../api';

function manta(t: number): Sprite {
  const L = 10, span = 6, w = L + 6, h = span * 2 + 1, cy = span;
  const { set, sprite } = canvas(w, h, [-w / 2, 0]);
  const beat = Math.sin(t * Math.PI * 2);
  for (let x = 0; x < L; x++) {
    const k = x / (L - 1);
    const profile = k < 0.7 ? Math.pow(k / 0.7, 1.15) : 1 - Math.pow((k - 0.7) / 0.3, 2) * 0.55;
    const half = Math.max(1, Math.round(span * profile * (0.74 + 0.26 * beat)));
    for (let dy = -half; dy <= half; dy++) {
      const a = Math.abs(dy);
      set(x + 4, cy + dy, a === 0 ? 4 : a <= 1 ? 3 : a >= half ? 1 : 2);
    }
  }
  set(L + 4, cy - 1, 3); set(L + 4, cy + 1, 3); set(L + 5, cy - 1, 4); set(L + 5, cy + 1, 4);
  for (let i = 0; i < 4; i++) set(3 - i, cy + (i === 3 ? Math.round(beat * 0.6) : 0), 1);
  return sprite();
}

export default defineCreature({
  id: 'manta', name: 'Скаты',
  palette: ['#17305a', '#2c5ea6', '#4f93d8', '#cfe9ff'],
  trailChars: '~-·', trailColor: 2,
  frames: frames(manta, 10), fps: 4, speed: 0.5, turn: 0.012, sizes: [1, 1, 1.35],
});
