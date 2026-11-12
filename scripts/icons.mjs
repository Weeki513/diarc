// Generates public/icons/*.png (no dependencies): rounded gradient square with a command-bar glyph.
import { writeFileSync, mkdirSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r; raw[o + 1] = g; raw[o + 2] = b; raw[o + 3] = a;
    }
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

const clamp = (v) => Math.max(0, Math.min(1, v));
function render(size) {
  const S = 4; // supersampling
  return png(size, (px, py) => {
    let acc = [0, 0, 0, 0];
    for (let sy = 0; sy < S; sy++) for (let sx = 0; sx < S; sx++) {
      const x = (px + (sx + 0.5) / S) / size, y = (py + (sy + 0.5) / S) / size;
      // rounded square
      const r = 0.23, m = 0.04;
      const qx = Math.max(Math.abs(x - 0.5) - (0.5 - m - r), 0), qy = Math.max(Math.abs(y - 0.5) - (0.5 - m - r), 0);
      if (Math.hypot(qx, qy) > r) continue;
      const t = clamp((x + y) / 2);
      let c = [94 + (168 - 94) * t, 92 + (85 - 92) * t, 230 + (247 - 230) * t];
      // glyph: a pill (search bar) with a dot
      const bx = Math.max(Math.abs(x - 0.5) - 0.2, 0), by = Math.max(Math.abs(y - 0.5) - 0.0, 0);
      const pill = Math.hypot(bx, by) - 0.1;
      const ring = Math.abs(pill) - 0.028;
      const dot = Math.hypot(x - 0.36, y - 0.5) - 0.045;
      if (ring < 0 || dot < 0) c = [255, 255, 255];
      acc[0] += c[0]; acc[1] += c[1]; acc[2] += c[2]; acc[3] += 255;
    }
    const n = S * S;
    const a = acc[3] / n;
    return a ? [acc[0] / (a / 255) / n, acc[1] / (a / 255) / n, acc[2] / (a / 255) / n, a].map(Math.round) : [0, 0, 0, 0];
  });
}

mkdirSync('public/icons', { recursive: true });
for (const s of [16, 32, 48, 128]) writeFileSync(`public/icons/${s}.png`, render(s));
console.log('icons written');
