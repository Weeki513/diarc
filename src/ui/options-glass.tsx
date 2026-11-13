/** Настройки → Жидкое стекло: sliders with a live preview that uses the real glass renderer. */
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { GLASS_CSS, GlassLayer } from '../content/glass';
import { DEFAULT_GLASS_TUNE, type GlassTune, type Settings } from '../shared/storage';
import { tuneVars } from './App';

type Key = keyof GlassTune;
const SLIDERS: { key: Key; label: string; min: number; max: number; step: number; unit?: string; hint?: string }[] = [
  { key: 'refraction', label: 'Преломление', min: 0, max: 2.5, step: 0.05, hint: 'Насколько сильно край стекла изгибает страницу' },
  { key: 'bezel', label: 'Ширина линзы', min: 8, max: 60, step: 1, unit: 'px', hint: 'Полоса у края, где происходит изгиб' },
  { key: 'chroma', label: 'Разделение цвета', min: 0, max: 0.9, step: 0.01, hint: 'Радужная кромка: RGB-каналы гнутся по-разному' },
  { key: 'blur', label: 'Размытие', min: 0, max: 10, step: 0.1, unit: 'px' },
  { key: 'saturation', label: 'Насыщенность', min: 0.5, max: 2.5, step: 0.05 },
  { key: 'tint', label: 'Плотность подложки', min: 0, max: 0.95, step: 0.01, hint: 'Больше — читаемее текст, меньше — прозрачнее' },
  { key: 'rim', label: 'Яркость бликов', min: 0, max: 1.5, step: 0.05 },
  { key: 'light', label: 'Радиус света от курсора', min: 60, max: 700, step: 10, unit: 'px' },
  { key: 'haze', label: 'Размытие страницы вокруг', min: 0, max: 12, step: 0.5, unit: 'px' },
];

export function GlassSection(props: { settings: Settings; update(p: Partial<Settings>): void }) {
  const tune = { ...DEFAULT_GLASS_TUNE, ...props.settings.glassTune };
  const set = (k: Key, v: number) => props.update({ glassTune: { ...tune, [k]: v } });
  const [scene, setScene] = useState<'light' | 'dark'>('light');
  return (
    <section>
      <h2>Жидкое стекло</h2>
      <label class="row">
        <span>Режим<small>«Жидкое» преломляет страницу у краёв. На слабом железе можно выбрать «Матовое».</small></span>
        <select value={props.settings.glass} onChange={(e) => props.update({ glass: (e.target as HTMLSelectElement).value as Settings['glass'] })}>
          <option value="liquid">Жидкое</option>
          <option value="frost">Матовое</option>
          <option value="off">Без стекла</option>
        </select>
      </label>
      <GlassPreview tune={tune} mode={props.settings.glass} scene={scene} />
      <div class="gp-scenes">
        <button class={`k-btn ${scene === 'light' ? 'k-primary' : ''}`} onClick={() => setScene('light')}>Светлый сайт</button>
        <button class={`k-btn ${scene === 'dark' ? 'k-primary' : ''}`} onClick={() => setScene('dark')}>Тёмный сайт</button>
        <small class="muted">Поводите курсором по превью</small>
      </div>
      <div class="sliders">
        {SLIDERS.map((s) => (
          <label class="slider" key={s.key} title={s.hint}>
            <span>{s.label}</span>
            <input type="range" min={s.min} max={s.max} step={s.step} value={tune[s.key]} onInput={(e) => set(s.key, +(e.target as HTMLInputElement).value)} />
            <output>{+tune[s.key].toFixed(2)}{s.unit ?? ''}</output>
          </label>
        ))}
      </div>
      <div class="form-actions">
        <button class="k-btn" onClick={() => props.update({ glassTune: DEFAULT_GLASS_TUNE })}>Сбросить</button>
      </div>
    </section>
  );
}

function GlassPreview(props: { tune: GlassTune; mode: Settings['glass']; scene: 'light' | 'dark' }) {
  const box = useRef<HTMLDivElement>(null);
  const layer = useRef<GlassLayer | null>(null);

  const layout = () => {
    const el = box.current;
    if (!el || !layer.current) return;
    const b = el.getBoundingClientRect();
    const plates = [...el.querySelectorAll<HTMLElement>('.glass')].map((g) => {
      const r = g.getBoundingClientRect();
      return { x: r.left - b.left, y: r.top - b.top, w: r.width, h: r.height, r: parseFloat(getComputedStyle(g).borderTopLeftRadius) || 0 };
    });
    layer.current.update({ plates, clip: null }, { x: 0, y: 0 });
    const html = document.documentElement.style;
    html.setProperty('--kx', `${b.left + b.width * 0.3}px`);
    html.setProperty('--ky', `${b.top - 140}px`);
  };

  useEffect(() => {
    const el = box.current!;
    if (!document.getElementById('glass-css')) {
      const st = document.createElement('style');
      st.id = 'glass-css';
      st.textContent = GLASS_CSS;
      document.head.append(st);
    }
    layer.current = new GlassLayer(el.querySelector('.gp-layer')!, props.mode, props.tune);
    layout();
    const ro = new ResizeObserver(layout);
    ro.observe(el);
    addEventListener('scroll', layout, { passive: true });
    // Spring-follow light, as in the bar.
    let tx = 0, ty = 0, x = 0, y = 0, vx = 0, vy = 0, raf = 0;
    const html = document.documentElement.style;
    const step = () => {
      vx = (vx + (tx - x) * 0.14) * 0.74;
      vy = (vy + (ty - y) * 0.14) * 0.74;
      x += vx;
      y += vy;
      html.setProperty('--lx', `${x}px`);
      html.setProperty('--ly', `${y}px`);
      raf = Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(vx) > 0.5 ? requestAnimationFrame(step) : 0;
    };
    const move = (e: MouseEvent) => {
      tx = e.clientX;
      ty = e.clientY;
      if (!raf) raf = requestAnimationFrame(step);
    };
    el.addEventListener('mousemove', move);
    return () => {
      ro.disconnect();
      removeEventListener('scroll', layout);
      el.removeEventListener('mousemove', move);
    };
  }, []);

  useLayoutEffect(() => {
    layer.current?.setMode(props.mode);
    layer.current?.setTune(props.tune);
    layout();
  }, [JSON.stringify(props.tune), props.mode]);

  return (
    <div class={`gp scene-${props.scene}`} ref={box}>
      <div class="gp-page">
        <div class="gp-blocks"><i /><i /><i /><i /><i /></div>
        <p>Жидкое стекло преломляет то, что под ним: текст, фото и полосы изгибаются у скруглённых краёв.</p>
      </div>
      <div class="gp-layer" />
      <div
        class="root preview"
        data-theme={props.scene}
        data-glass={props.mode}
        style={tuneVars(props.tune)}
      >
        <div class="glass gp-pill"><span>Поиск, URL или команда</span></div>
        <div class="gp-tiles">
          <div class="glass gp-tile"><b>КАЛЕНДАРЬ</b><span>Созвон с командой · 15:00</span><span>Спортзал · 19:00</span></div>
          <div class="glass gp-tile"><b>ПОГОДА</b><span class="gp-big">5°</span><span>↑18° ↓4°</span></div>
        </div>
      </div>
    </div>
  );
}
