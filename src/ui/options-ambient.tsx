/** Настройки → Существа: ambient ASCII creatures, with a live preview running the real engine. */
import { useEffect, useRef, useState } from 'preact/hooks';
import { Ambient } from '../ambient/engine';
import { creatureIds, creatures } from '../ambient/registry';
import { DEFAULT_AMBIENT, type AmbientSettings, type Settings } from '../shared/storage';

type Num = 'count' | 'speed' | 'cell' | 'trail' | 'opacity';
const SLIDERS: { key: Num; label: string; min: number; max: number; step: number; unit?: string }[] = [
  { key: 'count', label: 'Количество', min: 1, max: 60, step: 1 },
  { key: 'speed', label: 'Скорость', min: 0.1, max: 3, step: 0.05 },
  { key: 'cell', label: 'Размер пикселя', min: 4, max: 18, step: 1, unit: 'px' },
  { key: 'trail', label: 'Длина следа', min: 0, max: 80, step: 1 },
  { key: 'opacity', label: 'Прозрачность', min: 0.1, max: 1, step: 0.05 },
];

export function AmbientSection(props: { settings: Settings; update(p: Partial<Settings>): void }) {
  const a: AmbientSettings = { ...DEFAULT_AMBIENT, ...props.settings.ambient };
  const set = (patch: Partial<AmbientSettings>) => props.update({ ambient: { ...a, ...patch } });
  const [exclude, setExclude] = useState('');
  const ids = creatureIds();

  return (
    <section id="creatures">
      <h2>Существа</h2>
      <p class="muted">
        Пиксельные создания из ASCII, которые плавают по сайтам под стеклом бара. Спокойные и медленные, чтобы не отвлекать. Клик по
        странице их разгоняет. Свои существа добавляются одним файлом, инструкция в <code>docs/CREATURES.md</code>.
      </p>
      <AmbientPreview settings={a} />
      <div class="chips">
        {[...ids, 'mix'].map((id) => (
          <button key={id} class={`chip ${a.species === id ? 'on' : ''}`} onClick={() => set({ species: id })}>
            <i style={{ background: id === 'mix' ? '#999' : creatures.get(id)!.palette[2] }} />
            {id === 'mix' ? 'Все вместе' : creatures.get(id)!.name}
          </button>
        ))}
      </div>
      <label class="row">
        <span>Где показывать</span>
        <select value={a.show} onChange={(e) => set({ show: (e.target as HTMLSelectElement).value as AmbientSettings['show'] })}>
          <option value="bar">Только под открытым баром</option>
          <option value="always">Всегда поверх сайтов</option>
          <option value="off">Нигде (только вкладка «Аквариум»)</option>
        </select>
      </label>
      <div class="sliders">
        {SLIDERS.map((s) => (
          <label class="slider" key={s.key}>
            <span>{s.label}</span>
            <input type="range" min={s.min} max={s.max} step={s.step} value={a[s.key]} onInput={(e) => set({ [s.key]: +(e.target as HTMLInputElement).value })} />
            <output>{+a[s.key].toFixed(2)}{s.unit ?? ''}</output>
          </label>
        ))}
      </div>
      <label class="row">
        <span>Курсор</span>
        <select value={a.cursor} onChange={(e) => set({ cursor: (e.target as HTMLSelectElement).value as AmbientSettings['cursor'] })}>
          <option value="flee">Разбегаются</option>
          <option value="follow">Тянутся к курсору</option>
          <option value="none">Не замечают</option>
        </select>
      </label>
      <label class="row">
        <span>Область</span>
        <select value={a.area} onChange={(e) => set({ area: (e.target as HTMLSelectElement).value as AmbientSettings['area'] })}>
          <option value="full">Весь экран</option>
          <option value="bottom">Нижняя треть</option>
          <option value="edges">По краям, подальше от текста</option>
        </select>
      </label>
      <label class="row">
        <span>Цвет<small>Пусто — природные цвета</small></span>
        <span class="row-inline">
          <input type="color" value={a.color || '#4f93d8'} onInput={(e) => set({ color: (e.target as HTMLInputElement).value })} />
          {a.color && <button class="k-btn" onClick={() => set({ color: '' })}>Природный</button>}
        </span>
      </label>
      <label class="row">
        <span>Символы следа<small>Пусто — свои у каждого существа</small></span>
        <input class="text" value={a.chars} placeholder="~-·" maxLength={12} onInput={(e) => set({ chars: (e.target as HTMLInputElement).value })} />
      </label>
      <label class="row">
        <span>Частота кадров<small>Меньше — легче для батареи</small></span>
        <select value={a.fps} onChange={(e) => set({ fps: +(e.target as HTMLSelectElement).value as AmbientSettings['fps'] })}>
          <option value={15}>15</option>
          <option value={30}>30</option>
          <option value={60}>60</option>
        </select>
      </label>
      <label class="row">
        <span>Сетка точек на фоне</span>
        <input type="checkbox" checked={a.grid} onChange={(e) => set({ grid: (e.target as HTMLInputElement).checked })} />
      </label>
      <div class="field">
        <span>Не показывать на сайтах</span>
        {a.exclude.length > 0 && (
          <div class="chips">
            {a.exclude.map((h) => (
              <button key={h} class="chip" title="Убрать" onClick={() => set({ exclude: a.exclude.filter((x) => x !== h) })}>{h} ×</button>
            ))}
          </div>
        )}
        <div class="copy">
          <input class="text" placeholder="youtube.com" value={exclude} onInput={(e) => setExclude((e.target as HTMLInputElement).value)} />
          <button class="k-btn" onClick={() => {
            const h = exclude.trim().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
            if (h && !a.exclude.includes(h)) set({ exclude: [...a.exclude, h] });
            setExclude('');
          }}>Добавить</button>
        </div>
      </div>
      <div class="form-actions">
        <button class="k-btn" onClick={() => chrome.tabs.create({ url: chrome.runtime.getURL('ambient.html?mode=tab') })}>Открыть «Аквариум»</button>
        <button class="k-btn" onClick={() => props.update({ ambient: DEFAULT_AMBIENT })}>Сбросить</button>
      </div>
    </section>
  );
}

function AmbientPreview(props: { settings: AmbientSettings }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const eng = useRef<Ambient | null>(null);
  useEffect(() => {
    const c = ref.current!;
    eng.current = new Ambient(c);
    eng.current.configure({ ...props.settings, opacity: 1 });
    eng.current.start();
    // Only animate while the preview is on screen.
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? eng.current!.start() : eng.current!.stop()));
    io.observe(c);
    return () => {
      io.disconnect();
      eng.current?.stop();
    };
  }, []);
  useEffect(() => {
    eng.current?.configure({ ...props.settings, opacity: 1 });
  }, [JSON.stringify(props.settings)]);
  return (
    <canvas
      class="amb-preview"
      ref={ref}
      onPointerMove={(e) => { const r = ref.current!.getBoundingClientRect(); eng.current?.pointer(e.clientX - r.left, e.clientY - r.top); }}
      onPointerLeave={() => eng.current?.pointerLeave()}
      onClick={(e) => { const r = ref.current!.getBoundingClientRect(); eng.current?.scatter(e.clientX - r.left, e.clientY - r.top); }}
    />
  );
}
