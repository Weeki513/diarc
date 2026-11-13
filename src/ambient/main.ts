/**
 * The ambient page. Two modes:
 *  - overlay (default): a transparent, click-through layer the content script puts over sites;
 *    the cursor arrives by postMessage from the page.
 *  - tab: the "Аквариум" tab, a dark full-screen view with a creature picker.
 */
import { DEFAULT_AMBIENT, type AmbientSettings } from '../shared/storage';
import { Ambient } from './engine';
import { creatureIds, creatures } from './registry';

const mode = new URLSearchParams(location.search).get('mode') ?? 'overlay';
const css = `
  canvas { position: fixed; inset: 0; width: 100%; height: 100%; display: block; }
  body.tab { background: #08090c; font: 13px -apple-system, BlinkMacSystemFont, 'SF Pro Text', system-ui, sans-serif; color: #c9ccd6; }
  .picker { position: fixed; top: 18px; left: 50%; transform: translateX(-50%); display: flex; gap: 2px; padding: 4px; border-radius: 18px;
    background: rgba(28, 30, 38, 0.55); backdrop-filter: blur(16px) saturate(1.6); box-shadow: inset 0 0.5px 0 rgba(255,255,255,.25), 0 8px 24px rgba(0,0,0,.4); z-index: 2; }
  .picker button { all: unset; cursor: pointer; padding: 6px 12px; border-radius: 14px; display: flex; gap: 7px; align-items: center; color: #9aa0ad; }
  .picker button:hover { color: #fff; }
  .picker button.on { background: rgba(255,255,255,.1); color: #fff; }
  .picker i { width: 7px; height: 7px; border-radius: 50%; }
  .corner { position: fixed; top: 18px; right: 18px; z-index: 2; }
  .corner a { color: #9aa0ad; text-decoration: none; padding: 6px 12px; border-radius: 14px; background: rgba(28,30,38,.55); backdrop-filter: blur(16px); }
  .hint { position: fixed; left: 18px; bottom: 14px; font: 11px ui-monospace, Menlo, monospace; color: #4b5060; z-index: 2; }
`;
document.head.insertAdjacentHTML('beforeend', `<style>${css}</style>`);
const canvas = document.createElement('canvas');
document.body.append(canvas);
const amb = new Ambient(canvas);

let settings: AmbientSettings = DEFAULT_AMBIENT;
const apply = (s: Partial<AmbientSettings> | undefined) => {
  settings = { ...DEFAULT_AMBIENT, ...s };
  // In the tab the creatures are the point, so they are shown at full strength.
  amb.configure(mode === 'tab' ? { ...settings, opacity: 1 } : settings);
  renderPicker();
};

chrome.storage.local.get('settings').then((r) => {
  apply((r.settings as { ambient?: AmbientSettings } | undefined)?.ambient);
  amb.start();
});
chrome.storage.onChanged.addListener((c, area) => {
  if (area === 'local' && c.settings) apply((c.settings.newValue as { ambient?: AmbientSettings } | undefined)?.ambient);
});

async function save(patch: Partial<AmbientSettings>) {
  const r = await chrome.storage.local.get('settings');
  const cur = (r.settings ?? {}) as { ambient?: AmbientSettings };
  await chrome.storage.local.set({ settings: { ...cur, ambient: { ...DEFAULT_AMBIENT, ...cur.ambient, ...patch } } });
}

let picker: HTMLElement | null = null;
function renderPicker() {
  if (mode !== 'tab') return;
  if (!picker) {
    document.body.classList.add('tab');
    document.title = 'Diarc — Аквариум';
    picker = document.createElement('div');
    picker.className = 'picker';
    document.body.insertAdjacentHTML('beforeend', `<div class="corner"><a href="options.html#creatures">Настройки</a></div><div class="hint">клик — разогнать</div>`);
    document.body.append(picker);
    picker.addEventListener('click', (e) => {
      const id = (e.target as HTMLElement).closest('button')?.dataset.id;
      if (id) save({ species: id });
    });
  }
  const items = [...creatureIds().map((id) => ({ id, name: creatures.get(id)!.name, color: creatures.get(id)!.palette[2] })), { id: 'mix', name: 'Все', color: '#aaa' }];
  picker.innerHTML = items.map((i) => `<button data-id="${i.id}" class="${i.id === settings.species ? 'on' : ''}"><i style="background:${i.color}"></i>${i.name}</button>`).join('');
}

if (mode === 'tab') {
  window.addEventListener('pointermove', (e: PointerEvent) => amb.pointer(e.clientX, e.clientY));
  addEventListener('pointerleave', () => amb.pointerLeave());
  window.addEventListener('click', (e: MouseEvent) => !(e.target as HTMLElement).closest('.picker, .corner') && amb.scatter(e.clientX, e.clientY));
} else {
  addEventListener('message', (e) => {
    if (e.source !== parent) return;
    const d = e.data as { diarc?: string; x?: number; y?: number };
    if (d?.diarc === 'amb-pointer') amb.pointer(d.x!, d.y!);
    else if (d?.diarc === 'amb-leave') amb.pointerLeave();
    else if (d?.diarc === 'amb-click') amb.scatter(d.x!, d.y!);
    else if (d?.diarc === 'amb-pause') amb.stop();
    else if (d?.diarc === 'amb-play') amb.start();
  });
}
